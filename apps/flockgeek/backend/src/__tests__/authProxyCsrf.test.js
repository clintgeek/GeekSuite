// X-CSRF-Token forwarding on flockgeek's basegeek auth proxy (BURN_REVIEW #3).
//
// basegeek runs a double-submit CSRF token: a cookie-authenticated mutation
// must carry `X-CSRF-Token` matching the `geek_csrf` cookie
// (apps/basegeek/packages/api/src/middleware/csrfToken.js). `refresh` and
// `logout` in src/controllers/authController.js replay the browser's cookies
// to basegeek server-to-server, so a proxy that drops the header turns
// `CSRF_TOKEN=enforce` into a suite-wide logout: every /auth/refresh 403s, and
// @geeksuite/auth reads a 403 as session-expired and clears the session.
//
// "basegeek" is a real loopback HTTP server here rather than a mocked axios,
// for the same reason auth.test.js uses one: it records what actually went out
// on the wire, headers included, which is the whole claim under test.
// src/config/env.js snapshots process.env at import time, so BASEGEEK_URL is
// pointed at the loopback *before* the controller is dynamically imported.

import { jest } from '@jest/globals';
import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const CSRF = 'Rk9y3wQm-P2sLtVb8XcZa1NdHgJ0eIuY4TpS6MkOwQe';
const COOKIE = `geek_token=jwt.value; geek_refresh_token=r3fr3sh; geek_csrf=${ CSRF }`;

/** Headers of the last request "basegeek" received, per path. */
let received = {};

const basegeekServer = http.createServer((req, res) => {
  received[req.url] = req.headers;
  // Drain the body so the socket doesn't hang on keep-alive.
  req.resume();
  // A cookie carrying this marker simulates a basegeek that accepted the
  // connection and then never answers — the outbound-timeout test below uses
  // it. Everything else gets the normal canned response.
  if ((req.headers.cookie || '').includes('HANG_FOREVER')) return;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, token: 'new.jwt' }));
});

await new Promise((resolve) => basegeekServer.listen(0, '127.0.0.1', resolve));
process.env.BASEGEEK_URL = `http://127.0.0.1:${ basegeekServer.address().port }`;

const { refresh, logout } = await import('../controllers/authController.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/refresh', refresh);
  app.post('/api/auth/logout', logout);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  received = {};
});

afterAll(async () => {
  await new Promise((resolve) => basegeekServer.close(resolve));
});

describe('POST /api/auth/refresh', () => {
  test('forwards the browser CSRF token to basegeek', async () => {
    await request(buildApp())
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF)
      .send({});

    const headers = received['/api/auth/refresh'];
    expect(headers).toBeDefined();
    expect(headers['x-csrf-token']).toBe(CSRF);
    expect(headers.cookie).toBe(COOKIE);
  });

  test('sends no token when the browser sent none — it never mints one from the cookie', async () => {
    // geek_csrf is right there in the replayed Cookie header. A proxy that read
    // it and echoed it back would hand every proxied path a permanent pass
    // through the check basegeek is about to enforce, which is precisely the
    // check the enforce flip exists to turn on.
    await request(buildApp())
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE])
      .send({});

    const headers = received['/api/auth/refresh'];
    expect(headers).toBeDefined();
    expect(headers['x-csrf-token']).toBeUndefined();
    expect(headers.cookie).toBe(COOKIE);
  });
});

describe('POST /api/auth/logout', () => {
  test('forwards the browser CSRF token to basegeek', async () => {
    await request(buildApp())
      .post('/api/auth/logout')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF)
      .send({});

    const headers = received['/api/auth/logout'];
    expect(headers).toBeDefined();
    expect(headers['x-csrf-token']).toBe(CSRF);
    expect(headers.cookie).toBe(COOKIE);
  });

  test('sends no token when the browser sent none', async () => {
    await request(buildApp())
      .post('/api/auth/logout')
      .set('Cookie', [COOKIE])
      .send({});

    const headers = received['/api/auth/logout'];
    expect(headers).toBeDefined();
    expect(headers['x-csrf-token']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Outbound timeout to basegeek
// ---------------------------------------------------------------------------
// Every proxy call in src/controllers/authController.js now carries `timeout:
// upstreamTimeoutMs()` (BASEGEEK_TIMEOUT_MS, default 8000ms — mirrors
// packages/user/src/server/tokenUtils.js). `env.basegeekUrl` is snapshotted at
// import time (see the file banner above), so this reuses the one running
// "basegeek" rather than standing up a second server: a HANG_FOREVER marker
// in the cookie (forwarded verbatim, like the CSRF token above) tells that
// same server to accept the connection and never answer, and real axios is
// what enforces the timeout against that genuinely hung socket.
describe('outbound timeout to basegeek', () => {
  const ORIGINAL_TIMEOUT_ENV = process.env.BASEGEEK_TIMEOUT_MS;
  const HANG_COOKIE = `geek_token=HANG_FOREVER; geek_refresh_token=r3fr3sh; geek_csrf=${ CSRF }`;

  beforeEach(() => {
    // Small enough that the test runs fast; the mechanism under test is the
    // same one that uses the real 8000ms default in production.
    process.env.BASEGEEK_TIMEOUT_MS = '50';
  });

  afterEach(() => {
    if (ORIGINAL_TIMEOUT_ENV === undefined) delete process.env.BASEGEEK_TIMEOUT_MS;
    else process.env.BASEGEEK_TIMEOUT_MS = ORIGINAL_TIMEOUT_ENV;
  });

  test('a hung basegeek on /refresh 502s within the configured timeout, not 401', async () => {
    const start = Date.now();
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .set('Cookie', [HANG_COOKIE])
      .set('X-CSRF-Token', CSRF)
      .send({});
    const elapsed = Date.now() - start;

    expect(res.status).toBe(502);
    expect(elapsed).toBeLessThan(2000);
  });
});
