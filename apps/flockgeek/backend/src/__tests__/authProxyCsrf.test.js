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
