// Input-validation coverage for routes/auth.js's POST /refresh body
// (refreshToken, app), added as part of DOCS/TODO_ORDER.md #22 (storygeek
// slice). GET /me and POST /logout take no validatable body — see the
// report for why they're out of scope.
//
// Hermetic: axios is mocked so no network call reaches basegeek.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mod = (p) => new URL(p, import.meta.url).pathname;

const mockAxiosPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn(), post: mockAxiosPost },
}));

const { default: authRoutes } = await import(mod('../../routes/auth.js'));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/refresh validation', () => {
  test('accepted: a plausible refreshToken + app reaches basegeek', async () => {
    mockAxiosPost.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });

    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'storygeek' });

    expect(res.status).toBe(200);
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  test('accepted: an empty body (refresh via cookie only) still reaches the handler', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({});

    // No refreshToken in body or cookie -> the handler's own 400, proving
    // validation let the (empty, but well-formed) body through.
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('refreshToken required');
  });

  test('rejected: an unrecognized app name never reaches basegeek', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'not-a-real-app' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'app' })])
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('rejected: an oversized refreshToken is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'x'.repeat(4097) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'refreshToken' })])
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'tok', evil: true });

    expect(res.status).toBe(400);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ app: 'not-a-real-app' });

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// X-CSRF-Token forwarding (BURN_REVIEW #3)
// ---------------------------------------------------------------------------
// basegeek runs a double-submit CSRF token: a cookie-authenticated mutation
// must carry `X-CSRF-Token` matching the `geek_csrf` cookie
// (apps/basegeek/packages/api/src/middleware/csrfToken.js). routes/auth.js
// replays the browser's cookies server-to-server, so a proxy that drops the
// header turns `CSRF_TOKEN=enforce` into a suite-wide logout: every
// /auth/refresh 403s, and @geeksuite/auth reads 403 as session-expired.
describe('X-CSRF-Token forwarding to basegeek', () => {
  const CSRF = 'Rk9y3wQm-P2sLtVb8XcZa1NdHgJ0eIuY4TpS6MkOwQe';
  const COOKIE = `geek_token=jwt; geek_refresh_token=r3fr3sh; geek_csrf=${ CSRF }`;

  test('forwards the browser token upstream on /refresh', async () => {
    mockAxiosPost.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await request(buildApp())
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF)
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'storygeek' });

    const [, , config] = mockAxiosPost.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBe(CSRF);
    expect(config.headers.Cookie).toBe(COOKIE);
  });

  test('forwards the browser token upstream on /logout', async () => {
    mockAxiosPost.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await request(buildApp())
      .post('/api/auth/logout')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF)
      .send({});

    const [, , config] = mockAxiosPost.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBe(CSRF);
  });

  test('sends no token when the browser sent none — it never mints one from the cookie', async () => {
    // geek_csrf is right there in the replayed Cookie header. A proxy that read
    // it and echoed it back would hand every proxied path a permanent pass
    // through the check basegeek is about to enforce.
    mockAxiosPost.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await request(buildApp())
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE])
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'storygeek' });

    const [, , config] = mockAxiosPost.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBeUndefined();
    expect(Object.keys(config.headers).map((k) => k.toLowerCase()))
      .not.toContain('x-csrf-token');
    expect(config.headers.Cookie).toBe(COOKIE);
  });
});

// ---------------------------------------------------------------------------
// Outbound timeout to basegeek
// ---------------------------------------------------------------------------
// Every proxy call in routes/auth.js now carries `timeout:
// upstreamTimeoutMs()` (BASEGEEK_TIMEOUT_MS, default 8000ms — mirrors
// packages/user/src/server/tokenUtils.js). Real axios enforces that timeout
// itself, rejecting with ECONNABORTED once a hung socket runs out the clock.
// Since axios is mocked in this file, the mock below reproduces exactly that
// behavior — a "basegeek" that accepts the call and never answers, settled
// only by the timeout axios itself would apply.
describe('outbound timeout to basegeek', () => {
  const ORIGINAL_TIMEOUT_ENV = process.env.BASEGEEK_TIMEOUT_MS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Small enough that the test runs fast; the mechanism under test is the
    // same one that uses the real 8000ms default in production.
    process.env.BASEGEEK_TIMEOUT_MS = '50';
  });

  afterEach(() => {
    if (ORIGINAL_TIMEOUT_ENV === undefined) delete process.env.BASEGEEK_TIMEOUT_MS;
    else process.env.BASEGEEK_TIMEOUT_MS = ORIGINAL_TIMEOUT_ENV;
  });

  function hang(config) {
    return new Promise((_resolve, reject) => {
      setTimeout(() => {
        const err = new Error(`timeout of ${config.timeout}ms exceeded`);
        err.code = 'ECONNABORTED';
        reject(err);
      }, config.timeout);
    });
  }

  test('a hung basegeek on POST /api/auth/refresh 502s within the configured timeout, not 401', async () => {
    mockAxiosPost.mockImplementationOnce((url, body, config) => hang(config));

    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'storygeek' });

    expect(res.status).toBe(502);
    // The mechanism, not just the outcome: `hang()` settles off
    // `config.timeout` — with `setTimeout(fn, undefined)` it resolves on the
    // next tick regardless of BASEGEEK_TIMEOUT_MS, so a 502 alone (or an
    // elapsed-time bound) stays green even with `timeout: upstreamTimeoutMs()`
    // stripped from the call. Reading the value axios itself would have
    // received is what actually pins it.
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [, , config] = mockAxiosPost.mock.calls[0];
    expect(config.timeout).toBe(50);
  });
});
