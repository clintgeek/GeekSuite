/**
 * CSRF origin guard tests for bookgeek's API (TODO_ORDER #12).
 *
 * src/server.js mounts @geeksuite/user's `csrfGuard()` with the same
 * `isAllowedCorsOrigin` predicate `cors()` uses (src/corsOrigins.js), ahead
 * of `cors()` and ahead of every route.
 *
 * server.js itself calls start() at import time (Mongo connect + listen), so
 * it cannot be imported here. This suite reproduces the mount with the *real*
 * guard and the *real* predicate, over a real express app on a loopback port
 * driven with fetch — bookgeek has no supertest dependency and this needs
 * none.
 *
 * Unit coverage for every branch of the guard itself (Referer fallback,
 * opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
 * packages/user/src/server/__tests__/csrfGuard.test.js.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import { csrfGuard } from "@geeksuite/user/server";
import { isAllowedCorsOrigin } from "../src/corsOrigins.js";

const COOKIE = "geek_token=a-valid-token";
const EVIL_ORIGIN = "https://evil.example";
const OWN_ORIGIN = "https://bookgeek.clintgeek.com";

let server;
let baseUrl;
/** Route hits, so a test can prove the handler never ran. */
let reached;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfGuard({ allowedOrigins: isAllowedCorsOrigin, appName: "bookgeek", env: {} }));

  app.post("/api/books", (req, res) => {
    reached.push("create-book");
    res.status(201).json({ ok: true });
  });
  app.delete("/api/books/:id", (req, res) => {
    reached.push(`delete-book:${req.params.id}`);
    res.json({ ok: true });
  });
  app.get("/api/books", (req, res) => {
    reached.push("list-books");
    res.json({ books: [] });
  });
  app.post("/kindle/login", (req, res) => {
    reached.push("kindle-login");
    res.json({ ok: true });
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function send(path, { method = "POST", headers = {}, body } = {}) {
  reached = [];
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not every response has a body
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// The predicate itself — the guard is only as good as the rule it is given
// ---------------------------------------------------------------------------

describe("isAllowedCorsOrigin", () => {
  test("accepts clintgeek.com and its subdomains", () => {
    assert.equal(isAllowedCorsOrigin("https://clintgeek.com"), true);
    assert.equal(isAllowedCorsOrigin("https://bookgeek.clintgeek.com"), true);
    assert.equal(isAllowedCorsOrigin("https://basegeek.clintgeek.com"), true);
  });

  test("accepts the local dev ports", () => {
    assert.equal(isAllowedCorsOrigin("http://localhost:1801"), true);
    assert.equal(isAllowedCorsOrigin("http://127.0.0.1:1800"), true);
  });

  test("rejects third-party hosts, including lookalikes", () => {
    assert.equal(isAllowedCorsOrigin("https://evil.example"), false);
    assert.equal(isAllowedCorsOrigin("https://clintgeek.com.evil.example"), false);
    assert.equal(isAllowedCorsOrigin("https://notclintgeek.com"), false);
  });

  test("rejects an unrelated LAN address", () => {
    assert.equal(isAllowedCorsOrigin("http://192.168.1.17:1800"), false);
  });

  test("treats a missing origin as allowed — cors() needs that for non-browser clients", () => {
    assert.equal(isAllowedCorsOrigin(undefined), true);
    assert.equal(isAllowedCorsOrigin(""), true);
  });
});

// ---------------------------------------------------------------------------
// The guard, mounted the way server.js mounts it
// ---------------------------------------------------------------------------

describe("csrfGuard on bookgeek's wiring", () => {
  test("a cookie-authenticated POST from bookgeek's own origin reaches the route", async () => {
    const res = await send("/api/books", {
      headers: { cookie: COOKIE, origin: OWN_ORIGIN },
      body: { title: "Dune" },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(reached, ["create-book"]);
  });

  test("the same POST from a third-party page is rejected with 403 and never reaches the route", async () => {
    const res = await send("/api/books", {
      headers: { cookie: COOKIE, origin: EVIL_ORIGIN },
      body: { title: "Injected" },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: "csrf_origin_rejected" });
    assert.deepEqual(reached, []);
  });

  test("a cookie-authenticated DELETE from a third-party page is rejected", async () => {
    const res = await send("/api/books/abc123", {
      method: "DELETE",
      headers: { cookie: COOKIE, origin: EVIL_ORIGIN },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(reached, []);
  });

  test("a foreign Referer with no Origin is rejected too", async () => {
    const res = await send("/api/books", {
      headers: { cookie: COOKIE, referer: `${EVIL_ORIGIN}/attack.html` },
      body: { title: "Injected" },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(reached, []);
  });

  test("a cookie-authenticated mutation with no Origin and no Referer passes", async () => {
    const res = await send("/api/books", {
      headers: { cookie: COOKIE },
      body: { title: "From curl" },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(reached, ["create-book"]);
  });

  test("a GET from a foreign origin is not blocked by the guard — mutations only", async () => {
    const res = await send("/api/books", {
      method: "GET",
      headers: { cookie: COOKIE, origin: EVIL_ORIGIN },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(reached, ["list-books"]);
  });

  test("an unauthenticated mutation is not the guard's business", async () => {
    const res = await send("/api/books", {
      headers: { origin: EVIL_ORIGIN },
      body: { title: "Anon" },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(reached, ["create-book"]);
  });

  test("the Kindle form POST is untouched: it carries the PIN cookie, not geek_token", async () => {
    // No exemption is configured for /kindle — none is needed. requireKindleAuth
    // reads its own cookie, and the guard only engages on the SSO cookies.
    const res = await send("/kindle/login", {
      headers: { cookie: "bookgeek_kindle_ui=pin-hash" },
      body: { pin: "1234" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(reached, ["kindle-login"]);
  });

  test("a sibling GeekSuite subdomain is NOT stopped here — bookgeek's rule is host-suffix wide", async () => {
    // Documented limitation, not an oversight: bookgeek allows any
    // *.clintgeek.com origin for CORS, so the CSRF guard inherits that
    // breadth. Closing this case needs a per-app token, not an origin list.
    const res = await send("/api/books", {
      headers: { cookie: COOKIE, origin: "https://storygeek.clintgeek.com" },
      body: { title: "From a sibling" },
    });
    assert.equal(res.status, 201);
  });
});
