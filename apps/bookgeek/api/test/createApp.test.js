/**
 * createApp() — the whole API, imported without Mongo or listen (Phase B,
 * 2026-09-25). Before the split, server.js connected and listened at import
 * time, so every other test here rebuilt a slice of the app by hand; this one
 * drives the real thing: the 503 contract with no database, the auth guards,
 * the Kindle 503 with no PIN, CORS/CSRF ordering, and the SPA fallback's
 * extension-404 guard, which must stay the LAST route.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Nothing may be read from a real env or reach a real basegeek.
delete process.env.KINDLE_UI_PIN;
delete process.env.MONGODB_URI;
delete process.env.BASEGEEK_MONGODB_URI;
process.env.BASEGEEK_URL = "http://127.0.0.1:9";
process.env.BASEGEEK_TIMEOUT_MS = "500";

const { createApp } = await import("../src/app.js");

const MARKER = "<!-- bookgeek createApp.test.js fixture -->";
let publicPath;
let server;
let base;

before(async () => {
  publicPath = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-createapp-"));
  fs.writeFileSync(path.join(publicPath, "index.html"), `<!doctype html>${MARKER}`);
  fs.mkdirSync(path.join(publicPath, "assets"));
  fs.writeFileSync(path.join(publicPath, "assets", "app-abc123.js"), "console.log(1)");
  const app = createApp({ publicPath });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(publicPath, { recursive: true, force: true });
});

describe("createApp()", () => {
  test("imports without connecting or listening, and serves /api/health", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "bookgeek-api");
    assert.equal(body.db.state, 0);
  });

  test("book routes are mounted behind auth", async () => {
    const res = await fetch(`${base}/api/books/abc/cover`, { method: "DELETE" });
    assert.equal(res.status, 401);
  });

  test("/kindle answers 503 when KINDLE_UI_PIN is unset", async () => {
    const res = await fetch(`${base}/kindle`, { redirect: "manual" });
    assert.equal(res.status, 503);
  });

  test("csrfGuard runs before cors: a foreign-origin cookie mutation is a 403", async () => {
    const res = await fetch(`${base}/api/device-baskets`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        Cookie: "geek_token=x",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(res.status, 403);
  });

  test("CORS preflight from an allowed origin is answered", async () => {
    const res = await fetch(`${base}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://bookgeek.clintgeek.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://bookgeek.clintgeek.com");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });

  test("SPA routes get index.html", async () => {
    for (const p of ["/", "/settings", "/book/abc"]) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, p);
      assert.ok((await res.text()).includes(MARKER), p);
    }
  });

  test("hashed assets are immutable; a missing one 404s instead of index.html", async () => {
    const hit = await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const miss = await fetch(`${base}/assets/app-gone.js`);
    assert.equal(miss.status, 404);
    assert.equal((await miss.text()).includes(MARKER), false);
  });

  test("unknown /api paths 404 rather than falling through to the SPA", async () => {
    const res = await fetch(`${base}/api/books`);
    assert.equal(res.status, 404);
    assert.equal((await res.text()).includes(MARKER), false);
  });
});
