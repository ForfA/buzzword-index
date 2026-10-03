// Fetches a URL and returns its readable text, with errors phrased for humans.
//
// Safety note: this follows any public or private address. That is fine for the
// local server (it binds to 127.0.0.1), but before exposing this endpoint on the
// internet, block private/loopback/link-local addresses (checked after DNS and on
// every redirect) and add rate limiting — otherwise it is an open proxy (SSRF).

import { htmlToText } from "./html-to-text.js";
import { MAX_CHARS, MIN_WORDS } from "../public/lib/score.js";

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const LOGIN_WALLED = /(^|\.)(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.net|threads\.com)$/i;

export class UserError extends Error {}

async function readCapped(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= MAX_BYTES) break; // big pages are mostly scripts; the text is near the top
  }
  return Buffer.concat(chunks).subarray(0, MAX_BYTES);
}

function decode(bytes, contentType) {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function fetchPage(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl ?? "").trim());
  } catch {
    throw new UserError("That doesn't look like a valid link. Try something like https://example.com/post");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UserError("Only http:// and https:// links are supported.");
  }
  if (LOGIN_WALLED.test(url.hostname)) {
    throw new UserError(
      "That site keeps posts behind a login, so we can't fetch them. Copy the post text and paste it instead — the Index will be just as judgmental.",
    );
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "BuzzwordIndex/1.0", accept: "text/html,application/xhtml+xml,text/plain;q=0.9" },
    });
  } catch (err) {
    if (err.name === "TimeoutError") throw new UserError("That site took too long to answer. Try pasting the text instead.");
    throw new UserError("We couldn't reach that site. Check the link, or paste the text instead.");
  }

  if ([401, 403, 429, 999].includes(res.status)) {
    throw new UserError("That site blocks visitors like us (or wants a login). Paste the text instead.");
  }
  if (res.status === 404) throw new UserError("We couldn't find that page (404). Double-check the link?");
  if (!res.ok) throw new UserError(`The site answered with an error (HTTP ${res.status}). Paste the text instead.`);

  const contentType = res.headers.get("content-type") ?? "";
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
  if (!isHtml && !/text\/plain/i.test(contentType)) {
    res.body?.cancel();
    throw new UserError(`That link isn't a web page (it's ${contentType.split(";")[0] || "something else"}).`);
  }

  const raw = decode(await readCapped(res), contentType);
  const { title, text: full } = isHtml ? htmlToText(raw) : { title: "", text: raw.trim() };
  if ((full.match(/[\p{L}\p{N}]+/gu) ?? []).length < MIN_WORDS) {
    throw new UserError(
      "We couldn't find readable text on that page — it may be built with JavaScript or need a login. Paste the text instead.",
    );
  }

  const truncated = full.length > MAX_CHARS;
  const text = truncated ? full.slice(0, MAX_CHARS).replace(/\s+\S*$/, "") : full;
  return { title, text, truncated, url: res.url };
}
