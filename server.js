// Local server: serves public/ and adds the two things a static host can't do —
// fetching URLs (browsers are blocked by CORS) and AI roasts (needs a secret key).

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, validateText } from "./public/lib/score.js";
import { houseRoast } from "./public/lib/roasts.js";
import { fetchPage, UserError } from "./lib/fetch-page.js";
import { aiConfig, createRoaster } from "./lib/ai.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MAX_BODY = 256 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new UserError("That request is too large.");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new UserError("Malformed request.");
  }
}

async function serveStatic(pathname, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 404, "Not found", TYPES[".txt"]);
  }
  const file = path.join(PUBLIC, decoded.endsWith("/") ? decoded + "index.html" : decoded);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, "Not found", TYPES[".txt"]);
  try {
    const body = await readFile(file);
    send(res, 200, body, TYPES[path.extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found", TYPES[".txt"]);
  }
}

export function createApp({ roaster = null, ai = null } = {}) {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && pathname === "/api/config") {
        return send(res, 200, { extract: true, ai });
      }
      if (req.method === "POST" && pathname === "/api/extract") {
        const { url } = await readJson(req);
        return send(res, 200, await fetchPage(url));
      }
      if (req.method === "POST" && pathname === "/api/roast") {
        const { text } = await readJson(req);
        const problem = validateText(text);
        if (problem) throw new UserError(problem);
        const result = analyze(text);
        if (roaster) {
          try {
            return send(res, 200, { roast: await roaster(result, text), source: "ai" });
          } catch (err) {
            console.warn(`AI roast failed, using house roast: ${err.message}`);
          }
        }
        return send(res, 200, { roast: houseRoast(result, text), source: "house" });
      }
      if (pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
      if (req.method === "GET" || req.method === "HEAD") return await serveStatic(pathname, res);
      send(res, 405, { error: "Method not allowed" });
    } catch (err) {
      if (err instanceof UserError) return send(res, 400, { error: err.message });
      console.error(err);
      send(res, 500, { error: "Something went wrong on our side. Please try again." });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let config;
  try {
    config = aiConfig();
  } catch (err) {
    console.error(`Config error: ${err.message}`);
    process.exit(1);
  }
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  const ai = config && { provider: config.provider, model: config.model };
  createApp({ roaster: config && createRoaster(config), ai }).listen(port, host, () => {
    console.log(`Buzzword Index running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    console.log(ai ? `AI roasts: ${ai.provider} / ${ai.model}` : "AI roasts: off (house roasts only). Set AI_PROVIDER to enable.");
  });
}
