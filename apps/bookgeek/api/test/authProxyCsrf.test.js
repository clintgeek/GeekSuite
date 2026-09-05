/**
 * X-CSRF-Token forwarding on bookgeek's basegeek auth proxy (BURN_REVIEW #3).
 *
 * basegeek runs a double-submit CSRF token: a cookie-authenticated mutation
 * must carry `X-CSRF-Token` matching the `geek_csrf` cookie
 * (apps/basegeek/packages/api/src/middleware/csrfToken.js). `src/routes/authRoutes.js`
 * replays the browser's cookies to basegeek server-to-server, so a proxy that
 * drops the header turns `CSRF_TOKEN=enforce` into a suite-wide logout: every
 * /auth/refresh 403s, and @geeksuite/auth reads a 403 as session-expired.
 *
 * bookgeek carried a second half of the same bug: `/login` and `/register`
 * forwarded the caller's `Cookie` too. Those are credential exchanges that
 * need no session, and replaying one made them cookie-authenticated mutations
 * — so under enforce even the one call that could mint a fresh token was
 * blocked. They must now send no session at all.
 *
 * "basegeek" is a real loopback server that records what arrived on the wire,
 * in the same style as test/csrfGuard.test.js (bookgeek has no supertest).
 * `BASEGEEK_URL` is read at module-eval time in authRoutes.js, so it is
 * pointed at the loopback before the dynamic import below.
 */

import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

const CSRF = "Rk9y3wQm-P2sLtVb8XcZa1NdHgJ0eIuY4TpS6MkOwQe";
const COOKIE = `geek_token=jwt.value; geek_refresh_token=r3fr3sh; geek_csrf=${CSRF}`;

/** Headers of the last request "basegeek" received, keyed by path. */
let received = {};

const basegeek = http.createServer((req, res) => {
  received[req.url] = req.headers;
  req.resume();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    token: "new.jwt",
    refreshToken: "new.refresh",
    user: { id: "u1", username: "alice", email: "alice@example.com", app: "bookgeek" },
  }));
});

await new Promise((resolve) => basegeek.listen(0, "127.0.0.1", resolve));
process.env.BASEGEEK_URL = `http://127.0.0.1:${basegeek.address().port}`;

const { default: authRoutes } = await import("../src/routes/authRoutes.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => basegeek.close(resolve));
});

beforeEach(() => {
  received = {};
});

async function post(path, { headers = {}, body = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  try {
    await res.json();
  } catch {
    // not every response has a body
  }
  return res.status;
}

describe("POST /api/auth/refresh", () => {
  test("forwards the browser CSRF token to basegeek", async () => {
    await post("/api/auth/refresh", {
      headers: { cookie: COOKIE, "x-csrf-token": CSRF },
      body: { refreshToken: "r3fr3sh" },
    });

    const headers = received["/api/auth/refresh"];
    assert.ok(headers, "basegeek was called");
    assert.equal(headers["x-csrf-token"], CSRF);
    assert.equal(headers.cookie, COOKIE);
  });

  test("sends no token when the browser sent none — it never mints one from the cookie", () => {
    // geek_csrf is right there in the replayed Cookie header. A proxy that read
    // it and echoed it back would hand every proxied path a permanent pass
    // through the check basegeek is about to enforce.
    return post("/api/auth/refresh", {
      headers: { cookie: COOKIE },
      body: { refreshToken: "r3fr3sh" },
    }).then(() => {
      const headers = received["/api/auth/refresh"];
      assert.ok(headers, "basegeek was called");
      assert.equal(headers["x-csrf-token"], undefined);
      assert.equal(headers.cookie, COOKIE);
    });
  });
});

describe("POST /api/auth/logout", () => {
  test("forwards the browser CSRF token to basegeek", async () => {
    await post("/api/auth/logout", { headers: { cookie: COOKIE, "x-csrf-token": CSRF } });

    const headers = received["/api/auth/logout"];
    assert.ok(headers, "basegeek was called");
    assert.equal(headers["x-csrf-token"], CSRF);
    assert.equal(headers.cookie, COOKIE);
  });

  test("sends no token when the browser sent none", async () => {
    await post("/api/auth/logout", { headers: { cookie: COOKIE } });

    const headers = received["/api/auth/logout"];
    assert.ok(headers, "basegeek was called");
    assert.equal(headers["x-csrf-token"], undefined);
  });
});

describe("credential exchanges send no session at all", () => {
  test("/login does not replay the caller's cookies", async () => {
    await post("/api/auth/login", {
      headers: { cookie: COOKIE, "x-csrf-token": CSRF },
      body: { identifier: "alice", password: "correct-horse" },
    });

    const headers = received["/api/auth/login"];
    assert.ok(headers, "basegeek was called");
    assert.equal(headers.cookie, undefined);
  });

  test("/register does not replay the caller's cookies", async () => {
    await post("/api/auth/register", {
      headers: { cookie: COOKIE },
      body: { username: "alice", email: "alice@example.com", password: "correct-horse" },
    });

    const headers = received["/api/auth/register"];
    assert.ok(headers, "basegeek was called");
    assert.equal(headers.cookie, undefined);
  });
});
