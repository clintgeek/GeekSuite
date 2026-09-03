/**
 * auth.test.js — auth-isolation tests for bujogeek's backend.
 *
 * bujogeek's backend does NOT verify JWTs itself. `authenticate`
 * (src/middleware/authMiddleware.js) is `@geeksuite/user`'s `attachUser()`,
 * which:
 *   1. reads the `geek_token` cookie (or an `Authorization: Bearer` header),
 *   2. forwards it to basegeek via `GET {BASEGEEK_URL}/api/users/me`,
 *   3. trusts whatever basegeek says (200 + user → authenticated;
 *      401/403 → rejected; anything else, or no response at all → 502).
 *
 * So "malformed token", "expired token", and "token signed with the wrong
 * secret" all collapse to the same code path here: bujogeek has no local
 * secret to check them against, and would send all three to basegeek, which
 * would reject all three with 401. We simulate that by mocking the axios
 * call attachUser() makes and asserting the *outcome* attachUser produces
 * for each upstream response shape — no local secret verification exists in
 * this backend to test directly (that lives in basegeek; see
 * apps/basegeek/packages/api/src/__tests__/auth.test.js).
 *
 * bujogeek's backend also owns no local user-scoped Mongoose resource of its
 * own — `authenticate` is used with no `model` option (see
 * src/middleware/authMiddleware.js), so no local user record is ever read or
 * created here, and there is no bujogeek-owned REST route to IDOR-test for
 * cross-user data scoping. Task/collection ownership scoping lives in
 * basegeek's GraphQL layer and is covered there (see
 * apps/basegeek/packages/api/src/__tests__/bujogeekTaskOwnership.test.js and
 * friends). This suite is the whole of bujogeek's own auth-isolation
 * surface: does this backend correctly gate its two protected routes on a
 * trustworthy basegeek identity check, and does it fail closed when that
 * check is unavailable or says no?
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

// ── 1. Register the axios mock BEFORE any module that uses axios is imported ──
// Real axios' CJS module.exports is the axios instance itself, with a
// self-referencing `.default` (so both `import axios from 'axios'` — used by
// src/routes/authRoutes.js — and `const axios = require('axios')` — used by
// @geeksuite/user's tokenUtils.js — land on an object with .get/.post on it).
const mockAxios = { get: jest.fn(), post: jest.fn() };
mockAxios.default = mockAxios;
jest.unstable_mockModule('axios', () => mockAxios);
// `@geeksuite/user`'s tokenUtils.js is CommonJS (`require('axios')`), which
// is resolved through Jest's classic module registry rather than the ESM
// registry `unstable_mockModule` patches — both registrations are needed so
// every consumer (this app's own ESM `import axios from 'axios'`, and the
// shared package's CJS `require('axios')`) gets the same mock.
jest.mock('axios', () => mockAxios);

// ── 2. Dynamic imports — must come AFTER mock registration ────────────────────
const { default: createApp } = await import('../app.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** basegeek's real /api/users/me success shape: { user: {...} }. */
function upstreamUser(overrides = {}) {
  return {
    user: {
      _id: 'user-a',
      username: 'alice',
      email: 'alice@example.com',
      app: 'bujogeek',
      ...overrides,
    },
  };
}

/** An axios rejection shaped like basegeek returning a JSON error status. */
function upstreamError(status, message = 'Invalid or expired token') {
  const err = new Error(message);
  err.response = { status, data: { message } };
  return err;
}

/** An axios rejection with no `.response` — basegeek unreachable entirely. */
function networkError() {
  return new Error('connect ECONNREFUSED');
}

const PROTECTED_ROUTES = ['/api/me', '/api/auth/me'];

// ─────────────────────────────────────────────────────────────────────────────
// No credentials at all
// ─────────────────────────────────────────────────────────────────────────────

describe.each(PROTECTED_ROUTES)('GET %s — no credentials', (route) => {
  it('rejects with 401 and never calls out to basegeek', async () => {
    const res = await request(app).get(route);

    expect(res.status).toBe(401);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it('rejects a request with cookies present but no geek_token cookie', async () => {
    const res = await request(app)
      .get(route)
      .set('Cookie', ['some_other_cookie=whatever; theme=dark']);

    expect(res.status).toBe(401);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid credentials — malformed / expired / wrong-secret tokens.
//
// bujogeek can't tell these apart locally (it has no secret to check
// against); all three are proxied to basegeek and rejected identically. The
// distinct tests exist to document that each of these attacker-controlled
// inputs is actually exercised through the real code path and denied, not
// merely assumed to behave the same.
// ─────────────────────────────────────────────────────────────────────────────

describe.each(PROTECTED_ROUTES)('GET %s — invalid tokens', (route) => {
  it('malformed token (not a JWT at all) → 401', async () => {
    mockAxios.get.mockRejectedValueOnce(upstreamError(401, 'jwt malformed'));

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=not-a-real-jwt']);

    expect(res.status).toBe(401);
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('expired token → 401', async () => {
    mockAxios.get.mockRejectedValueOnce(upstreamError(401, 'jwt expired'));

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=expired.token.value']);

    expect(res.status).toBe(401);
  });

  it('token signed with the wrong secret → 401', async () => {
    mockAxios.get.mockRejectedValueOnce(upstreamError(401, 'invalid signature'));

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=wrong.secret.token']);

    expect(res.status).toBe(401);
  });

  it('basegeek explicitly forbidding the token (403) is still surfaced as 401', async () => {
    mockAxios.get.mockRejectedValueOnce(upstreamError(403, 'forbidden'));

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=forbidden-token']);

    expect(res.status).toBe(401);
  });

  it('basegeek being unreachable fails closed (502), not open', async () => {
    mockAxios.get.mockRejectedValueOnce(networkError());

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=some-token']);

    expect(res.status).toBe(502);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Valid credentials
// ─────────────────────────────────────────────────────────────────────────────

describe.each(PROTECTED_ROUTES)('GET %s — valid token', (route) => {
  it('200s and echoes back the authenticated identity', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: upstreamUser() });

    const res = await request(app)
      .get(route)
      .set('Cookie', ['geek_token=a-valid-token']);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: 'alice',
      email: 'alice@example.com',
    });
  });

  it('forwards exactly the geek_token cookie value to basegeek as a Bearer token', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: upstreamUser() });

    await request(app)
      .get(route)
      .set('Cookie', ['geek_token=a-valid-token']);

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://basegeek.test/api/users/me',
      { headers: { Authorization: 'Bearer a-valid-token' } }
    );
  });

  it('an Authorization: Bearer header works even without a cookie', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: upstreamUser({ username: 'bearer-user' }) });

    const res = await request(app)
      .get(route)
      .set('Authorization', 'Bearer header-token');

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('bearer-user');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-user isolation on the identity endpoint itself
//
// bujogeek's backend owns no scoped resource of its own (see file header),
// so there is no local record to IDOR-test. What we *can* prove at this
// layer is that identity is derived solely from the caller's own token —
// two different callers each get back only their own identity, never each
// other's, and nothing here lets one caller's request influence what
// another caller sees (no shared mutable state keyed off anything but the
// per-request token).
// ─────────────────────────────────────────────────────────────────────────────

describe('identity isolation between two different users', () => {
  it('user A and user B each see only their own identity from /api/me', async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: upstreamUser({ _id: 'user-a', username: 'alice', email: 'alice@example.com' }),
    });
    const resA = await request(app).get('/api/me').set('Cookie', ['geek_token=token-a']);

    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: upstreamUser({ _id: 'user-b', username: 'bob', email: 'bob@example.com' }),
    });
    const resB = await request(app).get('/api/me').set('Cookie', ['geek_token=token-b']);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.user.username).toBe('alice');
    expect(resB.body.user.username).toBe('bob');
    expect(resA.body.user._id).not.toBe(resB.body.user._id);
  });

  it("user B's token cannot be used to retrieve user A's identity", async () => {
    // Whatever basegeek says the token belongs to is exactly who bujogeek
    // trusts — there's no code path here that lets a request's own claims
    // (headers, body, etc.) override the identity basegeek resolved.
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: upstreamUser({ _id: 'user-b', username: 'bob', email: 'bob@example.com' }),
    });

    const res = await request(app)
      .get('/api/me')
      .set('Cookie', ['geek_token=token-b'])
      // An attacker-controlled header claiming to be user-a must be ignored.
      .set('X-User-Id', 'user-a');

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('bob');
    expect(res.body.user._id).toBe('user-b');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unprotected surface sanity check
//
// /api/health intentionally requires no auth. Asserting that here pins down
// that it — and only it, plus the /api/auth/* proxy routes covered in
// authRoutes.test.js — is the deliberately-open surface, so a future PR
// that accidentally removes `authenticate` from /api/me or /api/auth/me
// shows up as a failing test above, not a silent regression.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('does not require authentication', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF origin guard (TODO_ORDER #12)
//
// createApp() mounts @geeksuite/user's csrfGuard() with the same
// `allowedOrigins` list the cors() config uses (src/app.js). These cases pin
// down the contract that matters in production: a cookie-authenticated
// mutation from bujogeek's own origin still works, the same mutation from a
// third-party page does not, and the Origin-less clients the suite depends on
// (curl, container healthchecks, server-to-server, supertest itself) are not
// caught in the blast radius.
//
// The guard is mounted ahead of cors() (see src/app.js for why), so a
// blocked mutation is a deliberate 403 rather than the generic 500 this
// app's cors() callback produces for a disallowed Origin.
//
// POST /api/auth/logout is the probe: it always answers 200 with
// { success: true } once it reaches the handler — even when the upstream
// basegeek call fails — so a 200 means "the guard let this through" and a 403
// means "the guard stopped it", with no upstream mocking needed.
//
// Unit coverage for every branch of the guard itself (Referer fallback,
// opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
// packages/user/src/server/__tests__/csrfGuard.test.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF origin guard', () => {
  const COOKIE = ['geek_token=a-valid-token'];
  const OWN_ORIGIN = 'https://bujogeek.clintgeek.com';
  const EVIL_ORIGIN = 'https://evil.example';

  it('allows a cookie-authenticated mutation from an allow-listed origin', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', COOKIE)
      .set('Origin', OWN_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a cookie-authenticated mutation from a foreign origin with 403', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', COOKIE)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
  });

  it('rejects when only the Referer betrays the foreign origin', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', COOKIE)
      .set('Referer', `${EVIL_ORIGIN}/attack.html`);

    expect(res.status).toBe(403);
  });

  it('allows a cookie-authenticated mutation with no Origin and no Referer', async () => {
    // Non-browser clients (curl, server-to-server, healthchecks) send
    // neither header — see the csrfGuard module header for why that is a
    // pass and not a 403.
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', COOKIE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does not reject an unauthenticated mutation — there is no session to ride on', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', EVIL_ORIGIN);

    // Not the guard's business: with no auth cookie there is nothing for a
    // third-party page to abuse. This app's cors() still turns a disallowed
    // Origin into a 500 of its own (pre-existing behavior, deliberately left
    // alone in this pass) — what matters here is that the 403 is not ours.
    expect(res.status).not.toBe(403);
  });

  it('does not block a GET from a foreign origin — the guard is for mutations only', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Cookie', COOKIE)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).not.toBe(403);
  });

  it('a GET from the app\'s own origin still works end to end', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: upstreamUser() });

    const res = await request(app)
      .get('/api/me')
      .set('Cookie', COOKIE)
      .set('Origin', OWN_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
  });
});
