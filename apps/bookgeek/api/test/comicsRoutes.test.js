/**
 * The comics folder's two routes (src/routes/importRoutes.js, 2026-11-16):
 * GET /api/import/comics/status and POST /api/import/comics/scan. Mounted the
 * way app.js mounts the router, with the real auth middleware pointed at a
 * stand-in basegeek (importRoutes.test.js's shape). No Mongo: the scan route
 * must answer 503 before it looks at anything, which is also the proof that
 * a signed-in caller reaches the handler.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOKEN = "test-token";
const auth = { Authorization: `Bearer ${TOKEN}` };
const KEYS = ["LIBRARY_PATH", "COMICS_PATH", "BASEGEEK_URL", "TANKARR_URL"];
const saved = {};
let basegeek;
let server;
let baseUrl;
let libraryDir;

before(async () => {
  for (const key of KEYS) saved[key] = process.env[key];
  libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-comics-routes-"));
  fs.mkdirSync(path.join(libraryDir, "_tankarr"));
  process.env.LIBRARY_PATH = libraryDir;
  delete process.env.TANKARR_URL;

  const bg = express();
  bg.get("/api/users/me", (req, res) =>
    req.headers.authorization === `Bearer ${TOKEN}`
      ? res.json({ user: { id: "user-1", username: "chef" } })
      : res.status(401).json({ message: "nope" }),
  );
  basegeek = bg.listen(0, "127.0.0.1");
  await new Promise((r) => basegeek.once("listening", r));
  process.env.BASEGEEK_URL = `http://127.0.0.1:${basegeek.address().port}`;

  const { default: importRouter } = await import("../src/routes/importRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/import", importRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (basegeek) await new Promise((r) => basegeek.close(r));
  fs.rmSync(libraryDir, { recursive: true, force: true });
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the comics folder routes", () => {
  test("both need a signed-in caller", async () => {
    assert.equal((await fetch(`${baseUrl}/api/import/comics/status`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/import/comics/scan`, { method: "POST" })).status, 401);
  });

  test("status says whether the feature is on, which is what Settings shows the action by", async () => {
    process.env.COMICS_PATH = path.join(libraryDir, "_tankarr");
    let json = await (await fetch(`${baseUrl}/api/import/comics/status`, { headers: auth })).json();
    assert.equal(json.success, true);
    assert.equal(json.data.enabled, true);
    assert.equal(json.data.reason, null);

    delete process.env.COMICS_PATH;
    json = await (await fetch(`${baseUrl}/api/import/comics/status`, { headers: auth })).json();
    assert.deepEqual([json.data.enabled, json.data.reason], [false, "unset"]);

    // The answer never carries a path off the server.
    assert.doesNotMatch(JSON.stringify(json), new RegExp(libraryDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("scan answers 503 in the import routes' error shape when there is no database", async () => {
    process.env.COMICS_PATH = path.join(libraryDir, "_tankarr");
    const res = await fetch(`${baseUrl}/api/import/comics/scan`, { method: "POST", headers: auth });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { success: false, error: { message: "Database not connected" } });
  });
});
