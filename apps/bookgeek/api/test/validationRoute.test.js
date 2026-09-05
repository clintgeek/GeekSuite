/**
 * Route-level proof for TODO_ORDER #22 (bookgeek slice): the real
 * `validate()` middleware, wired the same way server.js wires it, in front
 * of a couple of representative routes over a real HTTP listener.
 *
 * server.js itself calls Mongo connect + listen at import time (see
 * csrfGuard.test.js's own header), so it can't be imported here either.
 * This suite builds a minimal express app with the *real* validate.js and
 * *real* schemas — same pattern csrfGuard.test.js uses for the CSRF guard —
 * driven with fetch over a loopback port (no supertest dependency, same as
 * every other bookgeek API test).
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { validate } from "../src/validation/validate.js";
import { downloadParamsSchema } from "../src/validation/schemas/kindle.js";
import { mergeBodySchema } from "../src/validation/schemas/enrichMerge.js";
import { calibreRescanQuerySchema } from "../src/validation/schemas/importJobs.js";

let server;
let baseUrl;
/** Route hits, so a test can prove a rejected request never reached the handler. */
let reached;

before(async () => {
  const app = express();
  app.use(express.json());

  // Mirrors server.js's own wiring: authenticateToken is skipped here (no
  // real Mongo/JWT in this suite — see csrfGuard.test.js) but validate()
  // sits in the exact same slot in the middleware chain.
  app.get(
    "/api/books/:id/download/:format",
    validate({ params: downloadParamsSchema }),
    (req, res) => {
      reached.push(`download:${req.params.id}:${req.params.format}`);
      res.json({ success: true, data: { format: req.params.format } });
    }
  );

  app.post("/api/books/merge", validate({ body: mergeBodySchema }), (req, res) => {
    reached.push("merge");
    res.json({ success: true, data: { primaryId: req.body.primaryId } });
  });

  app.post(
    "/api/import/calibre/rescan",
    validate({ query: calibreRescanQuerySchema }),
    (req, res) => {
      reached.push(`rescan:${req.query.limit ?? "default"}`);
      res.json({ success: true, data: { limit: req.query.limit ?? null } });
    }
  );

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function send(path, { method = "GET", body } = {}) {
  reached = [];
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe("validate() through a real app — the 400 envelope", () => {
  test("a valid params request reaches the handler unchanged", async () => {
    const res = await send("/api/books/abc123/download/epub");
    assert.equal(res.status, 200);
    assert.deepEqual(reached, ["download:abc123:epub"]);
  });

  test("an invalid format is rejected before the handler runs, with the shared 400 envelope", async () => {
    const res = await send("/api/books/abc123/download/pdf");
    assert.equal(res.status, 400);
    assert.deepEqual(reached, []);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, "VALIDATION_ERROR");
    assert.equal(res.json.error.message, "Validation failed");
    assert.ok(Array.isArray(res.json.error.details));
    assert.ok(res.json.error.details.some((d) => d.path === "format"));
  });

  test("a valid merge body reaches the handler", async () => {
    const res = await send("/api/books/merge", {
      method: "POST",
      body: { primaryId: "aaa", secondaryId: "bbb" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(reached, ["merge"]);
  });

  test("a merge body missing secondaryId 400s with the same envelope shape, and never reaches the handler", async () => {
    const res = await send("/api/books/merge", {
      method: "POST",
      body: { primaryId: "aaa" },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(reached, []);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, "VALIDATION_ERROR");
    assert.ok(res.json.error.details.some((d) => d.path === "secondaryId"));
  });

  test("an unknown body key on a strict schema 400s too (e.g. a stray 'force' flag on merge)", async () => {
    const res = await send("/api/books/merge", {
      method: "POST",
      body: { primaryId: "aaa", secondaryId: "bbb", force: true },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(reached, []);
  });

  test("query coercion is visible to the handler: a numeric-string limit arrives as a real Number", async () => {
    const res = await send("/api/import/calibre/rescan?limit=25", { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual(reached, ["rescan:25"]);
    assert.equal(res.json.data.limit, 25);
  });

  test("an invalid limit 400s instead of silently falling back to a default", async () => {
    const res = await send("/api/import/calibre/rescan?limit=0", { method: "POST" });
    assert.equal(res.status, 400);
    assert.deepEqual(reached, []);
  });
});
