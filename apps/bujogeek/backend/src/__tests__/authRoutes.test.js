/**
 * authRoutes.test.js — proxy behavior of src/routes/authRoutes.js.
 *
 * These routes (/api/auth/login, /register, /refresh, /logout) are
 * deliberately unauthenticated entry points — they hand credentials to
 * basegeek and relay whatever basegeek decides, including the Set-Cookie
 * headers that establish the `geek_token` session other tests in this suite
 * then exercise. Covered here mainly so the auth surface doesn't fail open
 * (e.g. inventing a session cookie itself, or leaking one user's upstream
 * response to a different request) if it's ever refactored.
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

const mockAxios = { get: jest.fn(), post: jest.fn() };
mockAxios.default = mockAxios;
jest.unstable_mockModule('axios', () => mockAxios);

const { default: createApp } = await import('../app.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

function upstreamError(status, message) {
  const err = new Error(message);
  err.response = { status, data: { message } };
  return err;
}

describe('POST /api/auth/login', () => {
  it('proxies credentials to basegeek and forwards its session cookie', async () => {
    mockAxios.post.mockResolvedValueOnce({
      status: 200,
      data: { user: { _id: 'user-a', username: 'alice' } },
      headers: { 'set-cookie': ['geek_token=issued-by-basegeek; HttpOnly'] },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alice', password: 'correct-horse' });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://basegeek.test/api/auth/login',
      { identifier: 'alice', password: 'correct-horse', app: 'bujogeek' }
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['set-cookie']).toEqual(['geek_token=issued-by-basegeek; HttpOnly']);
  });

  it('wrong credentials are rejected with the status basegeek gave, not a fabricated session', async () => {
    mockAxios.post.mockRejectedValueOnce(upstreamError(401, 'Invalid credentials'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alice', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('basegeek unreachable → 502, no session is issued', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'alice', password: 'whatever' });

    expect(res.status).toBe(502);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/auth/register', () => {
  it('tags the registration with this app before forwarding', async () => {
    mockAxios.post.mockResolvedValueOnce({
      status: 201,
      data: { user: { _id: 'user-new' } },
      headers: {},
    });

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'x' });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://basegeek.test/api/auth/register',
      { email: 'new@example.com', password: 'x', app: 'bujogeek' }
    );
  });
});

describe('POST /api/auth/logout', () => {
  it('always reports success locally, even if the upstream call fails', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('upstream down'));

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', ['geek_token=whatever']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('forwards the caller-supplied cookie/authorization to basegeek, not a fixed one', async () => {
    mockAxios.post.mockResolvedValueOnce({ status: 200, data: {}, headers: {} });

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', ['geek_token=user-a-token']);

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://basegeek.test/api/auth/logout',
      {},
      { headers: { Cookie: 'geek_token=user-a-token' } }
    );
  });
});

// ---------------------------------------------------------------------------
// X-CSRF-Token forwarding (BURN_REVIEW #3)
// ---------------------------------------------------------------------------
// basegeek runs a double-submit CSRF token: a cookie-authenticated mutation
// must carry `X-CSRF-Token` matching the `geek_csrf` cookie
// (apps/basegeek/packages/api/src/middleware/csrfToken.js). These routes replay
// the browser's cookies server-to-server, so a proxy that drops the header
// turns `CSRF_TOKEN=enforce` into a suite-wide logout: every /auth/refresh
// 403s, and @geeksuite/auth reads 403 as session-expired.
describe('X-CSRF-Token forwarding', () => {
  const CSRF = 'Rk9y3wQm-P2sLtVb8XcZa1NdHgJ0eIuY4TpS6MkOwQe';
  const COOKIE = `geek_token=jwt; geek_refresh_token=r3fr3sh; geek_csrf=${ CSRF }`;

  it('forwards the browser token upstream on /refresh', async () => {
    mockAxios.post.mockResolvedValueOnce({ status: 200, data: {}, headers: {} });

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF);

    const [, , config] = mockAxios.post.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBe(CSRF);
    expect(config.headers.Cookie).toBe(COOKIE);
  });

  it('forwards the browser token upstream on /logout', async () => {
    mockAxios.post.mockResolvedValueOnce({ status: 200, data: {}, headers: {} });

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [COOKIE])
      .set('X-CSRF-Token', CSRF);

    const [, , config] = mockAxios.post.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBe(CSRF);
  });

  it('sends no token when the browser sent none — it never mints one from the cookie', async () => {
    // geek_csrf is right there in the replayed Cookie header. A proxy that read
    // it and echoed it back would hand every proxied path a permanent pass
    // through the check basegeek is about to enforce.
    mockAxios.post.mockResolvedValueOnce({ status: 200, data: {}, headers: {} });

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [COOKIE]);

    const [, , config] = mockAxios.post.mock.calls[0];
    expect(config.headers['X-CSRF-Token']).toBeUndefined();
    expect(Object.keys(config.headers).map((k) => k.toLowerCase()))
      .not.toContain('x-csrf-token');
    expect(config.headers.Cookie).toBe(COOKIE);
  });
});
