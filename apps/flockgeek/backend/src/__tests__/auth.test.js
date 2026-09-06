// Auth-isolation test suite for apps/flockgeek/backend.
//
// Night 2 — 2026-09-06 (Q22): this file used to also cover the REST CRUD
// layer's ownerId scoping (birds/egg-production) and the CSRF origin guard
// wired in front of it. That layer is gone — deleted with the rest of
// routes/{birds,groups,...}.js and controllers/*Controller.js, see
// apps/flockgeek/CONTEXT.md "Night 2" section. What's left below is the part
// that survives the deletion untouched: the real middleware chain behind
// GET /api/me and the auth proxy routes.
//
//   geek_token cookie -> requireAuth -> @geeksuite/user's attachUser()
//     -> GET {BASEGEEK_URL}/api/users/me
//
// "basegeek" is stood up as a real loopback HTTP server for the duration of
// this file rather than mocked at the module level, for the same reason the
// original file did: attachUser() (via tokenUtils.validateToken) reads
// process.env.BASEGEEK_URL at *request* time, and @geeksuite/user/server is
// CommonJS all the way down to axios, which jest.unstable_mockModule cannot
// reach under this project's native-ESM config.

import http from 'node:http';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { csrfGuard } from '@geeksuite/user/server';

let requireAuth;
let authRoutes;
let allowedOrigins;

const TOKEN_A = 'token-for-owner-a';
const OWNER_A = 'owner-aaaa';

let basegeekUsers = {};
let basegeekRequestCount = 0;
let basegeekServer;
let basegeekUrl;

beforeAll(async () => {
  process.env.CORS_ORIGIN = 'https://flockgeek.clintgeek.com';

  // Start "basegeek" and pin BASEGEEK_URL to it *before* anything below
  // dynamically imports routes/auth.js -> controllers/authController.js ->
  // config/env.js, which snapshots process.env.BASEGEEK_URL at import time
  // (unlike @geeksuite/user's attachUser(), which reads it per-request — see
  // the requireAuth-unreachable test below, which relies on that difference).
  basegeekServer = http.createServer((req, res) => {
    basegeekRequestCount += 1;
    if (req.url === '/api/auth/refresh' || req.url === '/api/auth/logout') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, token: 'new.jwt' }));
    }
    if (req.url !== '/api/users/me') {
      res.writeHead(404);
      return res.end();
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = token && basegeekUsers[token];
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Invalid or expired token' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ user }));
  });
  await new Promise((resolve) => basegeekServer.listen(0, '127.0.0.1', resolve));
  basegeekUrl = `http://127.0.0.1:${basegeekServer.address().port}`;
  process.env.BASEGEEK_URL = basegeekUrl;

  ({ requireAuth } = await import('../middleware/authMiddleware.js'));
  ({ default: authRoutes } = await import('../routes/auth.js'));
  ({ allowedOrigins } = await import('../config/corsOrigins.js'));
});

afterAll(async () => {
  await new Promise((resolve) => basegeekServer.close(resolve));
});

beforeEach(() => {
  process.env.BASEGEEK_URL = basegeekUrl;
  basegeekRequestCount = 0;
  basegeekUsers = {
    [TOKEN_A]: { _id: OWNER_A, username: 'alice', email: 'alice@example.com' },
  };
});

function buildWhoamiApp() {
  const app = express();
  // A minimal stand-in for a requireAuth-protected route (flockgeek's own
  // GET /api/me uses requireAuth + @geeksuite/user's meHandler(); this
  // isolates the requireAuth contract itself).
  app.get('/whoami', requireAuth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email } });
  });
  return app;
}

describe('requireAuth — cookie / basegeek contract', () => {
  test('no cookie and no bearer token -> 401, basegeek is never contacted', async () => {
    const res = await request(buildWhoamiApp()).get('/whoami');

    expect(res.status).toBe(401);
    expect(basegeekRequestCount).toBe(0);
  });

  test('basegeek rejects the token (expired/invalid) -> 401', async () => {
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', 'geek_token=not-a-real-token');

    expect(res.status).toBe(401);
    expect(basegeekRequestCount).toBe(1);
  });

  // Contract since 2026-09-05 (packages/user tokenUtils.classifyValidationError):
  // "basegeek unreachable" is *unavailable*, answered 503 + Retry-After with
  // code AUTH_UNAVAILABLE — distinct from an invalid token (401) so no client
  // logs a user out because the validator could not be reached.
  test('basegeek unreachable -> 503 + Retry-After, not 401', async () => {
    process.env.BASEGEEK_URL = 'http://127.0.0.1:1'; // nothing listens here
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.message).toMatch(/unavailable/i);
  });

  test('valid cookie + basegeek 200 -> 200 with the caller\'s identity', async () => {
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: OWNER_A,
      username: 'alice',
      email: 'alice@example.com',
    });
    expect(basegeekRequestCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF origin guard on the surviving mutation routes (Night 2 — Q22)
//
// server.js mounts @geeksuite/user's csrfGuard() with the allow-list from
// src/config/corsOrigins.js ahead of every route, including the auth proxy's
// POST /api/auth/refresh and /api/auth/logout — the only mutating routes left
// in this backend now that the REST CRUD layer is gone. This guard matters
// more on flockgeek than anywhere else in the suite: the other six backends
// hand cors() an origin *callback* that errors on a mismatch, so a foreign
// Origin never reaches a route even with no guard at all. flockgeek hands
// cors() a plain array, and the cors package's array form does not reject —
// it omits the Access-Control-Allow-Origin header and calls next(). Losing
// app-level proof that the guard still blocks a real mutation here (the old
// coverage lived on the now-deleted /api/birds) would leave that landmine
// unguarded by anything but the guard's own unit tests
// (packages/user/src/server/__tests__/csrfGuard.test.js).
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF origin guard on the auth proxy', () => {
  const OWN_ORIGIN = 'https://flockgeek.clintgeek.com';
  const EVIL_ORIGIN = 'https://evil.example';

  function buildGuardedAuthApp() {
    const app = express();
    app.use(csrfGuard({ allowedOrigins, appName: 'flockgeek-test' }));
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRoutes);
    return app;
  }

  test('production CORS_ORIGIN is the allow-list the guard is built from', () => {
    expect(allowedOrigins).toEqual([OWN_ORIGIN]);
  });

  test('logout from a third-party page is rejected before basegeek is contacted', async () => {
    const app = buildGuardedAuthApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `geek_token=${TOKEN_A}`)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
    expect(basegeekRequestCount).toBe(0);
  });

  test("logout from flockgeek's own origin reaches basegeek", async () => {
    const app = buildGuardedAuthApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `geek_token=${TOKEN_A}`)
      .set('Origin', OWN_ORIGIN);

    expect(res.status).toBe(200);
    expect(basegeekRequestCount).toBe(1);
  });
});
