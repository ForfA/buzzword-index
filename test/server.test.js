import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server.js";
import { mockServer } from "./helpers.js";

const HYPE = "Thrilled to announce our AI-powered platform that leverages synergy to unlock a paradigm shift. Agree?";

async function start(options = {}) {
  const server = createApp(options);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { base, post, close: () => new Promise((r) => server.close(r)) };
}

test("config reports URL support and no AI by default", async (t) => {
  const app = await start();
  t.after(app.close);
  const body = await (await fetch(app.base + "/api/config")).json();
  assert.deepEqual(body, { extract: true, ai: null });
});

test("roast falls back to the house roast without a provider", async (t) => {
  const app = await start();
  t.after(app.close);
  const { status, body } = await app.post("/api/roast", { text: HYPE });
  assert.equal(status, 200);
  assert.equal(body.source, "house");
  assert.ok(body.roast.length > 20);
});

test("roast uses the AI provider when configured, and falls back if it fails", async (t) => {
  const ok = await start({ roaster: async () => "An AI roast.", ai: { provider: "test", model: "m" } });
  const broken = await start({ roaster: async () => { throw new Error("boom"); }, ai: { provider: "test", model: "m" } });
  t.after(ok.close);
  t.after(broken.close);
  assert.deepEqual((await ok.post("/api/roast", { text: HYPE })).body, { roast: "An AI roast.", source: "ai" });
  assert.equal((await broken.post("/api/roast", { text: HYPE })).body.source, "house");
});

test("roast rejects invalid text with a friendly message", async (t) => {
  const app = await start();
  t.after(app.close);
  const { status, body } = await app.post("/api/roast", { text: "too short" });
  assert.equal(status, 400);
  assert.match(body.error, /words/);
});

test("extract fetches a page and returns its readable text", async (t) => {
  const site = await mockServer(() => ({
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<html><head><title>Big News</title></head><body><nav>Menu</nav><article><p>${HYPE}</p></article></body></html>`,
  }));
  const app = await start();
  t.after(site.close);
  t.after(app.close);
  const { status, body } = await app.post("/api/extract", { url: site.url + "/post" });
  assert.equal(status, 200);
  assert.equal(body.title, "Big News");
  assert.equal(body.text, HYPE);
  assert.equal(body.truncated, false);
});

test("extract explains failures in plain words", async (t) => {
  const site = await mockServer(({ url }) =>
    url === "/pdf"
      ? { headers: { "content-type": "application/pdf" }, body: "%PDF" }
      : { status: 404, headers: { "content-type": "text/html" }, body: "nope" },
  );
  const app = await start();
  t.after(site.close);
  t.after(app.close);
  const cases = [
    [{ url: "ftp://example.com/x" }, /http/i],
    [{ url: "not a url" }, /valid/i],
    [{ url: "https://www.linkedin.com/posts/someone-123" }, /paste/i],
    [{ url: site.url + "/missing" }, /404|find/i],
    [{ url: site.url + "/pdf" }, /web page/i],
  ];
  for (const [payload, message] of cases) {
    const { status, body } = await app.post("/api/extract", payload);
    assert.equal(status, 400, payload.url);
    assert.match(body.error, message, payload.url);
  }
});

test("serves the app and refuses to leave the public folder", async (t) => {
  const app = await start();
  t.after(app.close);
  const index = await fetch(app.base + "/");
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /text\/html/);
  const lib = await fetch(app.base + "/lib/score.js");
  assert.match(lib.headers.get("content-type"), /javascript/);

  const { port } = new URL(app.base);
  for (const path of ["/../package.json", "/..%2fpackage.json", "/%2e%2e/server.js"]) {
    const status = await new Promise((resolve, reject) =>
      http.get({ host: "127.0.0.1", port, path }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject),
    );
    assert.equal(status, 404, path);
  }
});
