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
