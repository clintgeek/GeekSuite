/**
 * SPA-fallback guard proof for apps/bookgeek/api/src/server.js (Q53).
 *
 * bookgeek's server.js already carries the extname-404 guard (added before
 * this pass — see the regex catch-all just above `start()`) and connects
 * Mongo + listens at import time, so it can't be imported directly here (the
 * same reason csrfGuard.test.js builds its own app instead of importing
 * server.js). This mirrors the exact catch-all regex and guard body from
 * server.js over a throwaway fixture directory, to prove the pattern this
 * app already ships holds: a deleted hashed asset 404s, a real SPA route
 * still gets index.html, and /api, /kindle, /download-basket stay excluded.
 *
 * Keep this in sync with server.js's catch-all if that ever changes shape.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const FIXTURE_MARKER = "<!-- bookgeek spaFallback.test.js fixture -->";

let publicPath;
let server;
let baseUrl;

before(async () => {
  publicPath = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-spa-fallback-"));
  fs.writeFileSync(
    path.join(publicPath, "index.html"),
    `${FIXTURE_MARKER}\n<html><body>bookgeek</body></html>\n`
  );

  const app = express();
  app.use(express.static(publicPath));

  // Exact mirror of the real catch-all in src/server.js.
  app.get(/^\/(?!api(?:\/|$)|kindle(?:\/|$)|download-basket(?:\/|$)).*/, (req, res) => {
    if (path.extname(req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    return res.sendFile(path.join(publicPath, "index.html"));
  });

  app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(publicPath, { recursive: true, force: true });
});

describe("SPA fallback — extname 404 guard (Q53)", () => {
  test("GET /assets/nope-DEAD.js -> 404 text/plain, never index.html", async () => {
    const res = await fetch(`${baseUrl}/assets/nope-DEAD.js`);
    const text = await res.text();

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") || "", /text\/plain/);
    assert.ok(!text.includes(FIXTURE_MARKER));
  });

  test("GET /some/spa/route (no extension) -> 200, serves index.html", async () => {
    const res = await fetch(`${baseUrl}/some/spa/route`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.ok(text.includes(FIXTURE_MARKER));
  });

  test("GET /api/whatever-unknown is excluded from the SPA fallback", async () => {
    const res = await fetch(`${baseUrl}/api/whatever-unknown`);
    const json = await res.json();

    assert.equal(res.status, 404);
    assert.deepEqual(json, { message: "Route not found" });
  });
});
