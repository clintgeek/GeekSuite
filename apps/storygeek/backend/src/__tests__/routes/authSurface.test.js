// Auth-surface isolation tests for apps/storygeek/backend.
//
// StoryGeek does NOT verify JWTs locally (there is no local
// `jwt.verify(token, JWT_SECRET)` in this backend). Auth is fully delegated
// to `@geeksuite/user/server`'s attachUser(), which forwards the caller's
// `geek_token` cookie (or Authorization: Bearer header) to baseGeek's
// `GET /api/users/me` and trusts baseGeek's verdict. See:
//   - src/middleware/auth.js        (authenticateToken = attachUser({...}))
//   - src/app.js                    (GET /api/me = attachUser + meHandler)
//   - packages/user/src/server/attachUser.js, tokenUtils.js (the real impl)
//
// Because verification happens over the network on baseGeek, this suite
// fakes `@geeksuite/user/server` with a stand-in that faithfully reproduces
// its documented contract (cookie/Bearer extraction, 401 on missing/unknown
// token, 200 + identity on a recognized one) but is driven by an in-memory
// token store instead of an HTTP call — so no test here ever hits the
// network. This also means "malformed", "expired", and "wrong-secret"
// tokens are indistinguishable from StoryGeek's point of view: all three
// are just tokens baseGeek doesn't vouch for, and all three collapse to the
// same 401 path. That collapse is itself the thing worth locking down: if
// someone "simplifies" attachUser to treat an unrecognized token as
// anonymous instead of rejecting it, these tests catch it.
//
// Real (unmocked) code under test: src/app.js, src/middleware/auth.js,
// src/routes/stories.js (only the pre-auth 401 boundary).

import { jest } from '@jest/globals';
// The REAL guard, imported through its own subpath so the module mock below
// (which replaces '@geeksuite/user/server' wholesale) cannot stub it out. The
// CSRF tests at the bottom of this file exercise the actual implementation
// app.js runs in production, not a stand-in.
import { csrfGuard } from '@geeksuite/user/server/csrfGuard';

jest.unstable_mockModule('@geeksuite/user/server', () => {
  // token -> normalized SSO user, as tokenUtils.normalizeSsoUser would shape it
  const tokenStore = new Map();

  function getTokenFromRequest(req, cookieName = 'geek_token') {
    const authHeader = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf('=');
      const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
      if (key !== cookieName) continue;
      const value = idx >= 0 ? trimmed.slice(idx + 1) : '';
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
    return null;
  }

  function attachUser(options = {}) {
    const { required = true } = options;
    return async (req, res, next) => {
      const token = getTokenFromRequest(req);
      if (!token) {
        if (!required) {
          req.geek = null;
          return next();
        }
        return res.status(401).json({ message: 'Authentication token required' });
      }

      const ssoUser = tokenStore.get(token) || null;
      if (!ssoUser) {
        if (!required) {
          req.geek = null;
          return next();
        }
        // Real attachUser maps baseGeek 401/403 -> 401 here.
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      req.geek = { user: ssoUser, localUser: null };
      req.user = ssoUser;
      return next();
    };
  }

  function meHandler() {
    return (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!req.geek?.user) return res.status(401).json({ message: 'Not authenticated' });
      return res.json({ user: { ...req.geek.user } });
    };
  }

  return { attachUser, meHandler, csrfGuard, __tokenStore: tokenStore };
});

let app;
let request;
let tokenStore;

beforeAll(async () => {
  ({ __tokenStore: tokenStore } = await import('@geeksuite/user/server'));
  ({ default: app } = await import('../../app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  tokenStore.clear();
});

function cookieHeader(token) {
  return `geek_token=${token}`;
}

describe('GET /api/me — identity endpoint', () => {
  test('no cookie -> 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  test('malformed token -> 401', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('not-a-jwt-at-all'));
    expect(res.status).toBe(401);
  });

  test('expired token -> 401', async () => {
    // Not present in the store, exactly as an expired token would be once
    // baseGeek rejects it — StoryGeek never sees "expired" as a distinct
    // reason, only "not vouched for".
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('expired.jwt.token'));
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret -> 401', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('wrong-secret.jwt.token'));
    expect(res.status).toBe(401);
  });

  test('valid token -> 200 with identity', async () => {
    tokenStore.set('good-token', { _id: 'user-a', id: 'user-a', userId: 'user-a', username: 'alice', email: 'alice@example.com' });

    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('good-token'));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ _id: 'user-a', username: 'alice', email: 'alice@example.com' });
  });

  test('valid token via Authorization Bearer header (no cookie) -> 200', async () => {
    tokenStore.set('bearer-token', { _id: 'user-b', id: 'user-b', userId: 'user-b', username: 'bob', email: 'bob@example.com' });

    const res = await request(app).get('/api/me').set('Authorization', 'Bearer bearer-token');

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('bob');
  });
});

describe('Protected story route without a cookie', () => {
  test('GET /api/stories/:storyId -> 401 before any story lookup', async () => {
    const res = await request(app).get('/api/stories/story-1');
    expect(res.status).toBe(401);
  });

  test('POST /api/stories/start -> 401', async () => {
    const res = await request(app).post('/api/stories/start').send({ prompt: 'hi' });
    expect(res.status).toBe(401);
  });

  test('malformed cookie on a protected story route -> 401, not 500', async () => {
    const res = await request(app).get('/api/stories/story-1').set('Cookie', cookieHeader('garbage'));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF origin guard (TODO_ORDER #12)
//
// src/app.js mounts @geeksuite/user's csrfGuard() with the same
// `allowedOrigins` list the cors() config uses, ahead of cors() itself (see
// the comment there for why). The module mock above hands app.js the *real*
// csrfGuard, so these cases run the production implementation.
//
// POST /api/auth/refresh is the probe: with a geek_token cookie but no
// refresh token in the body or cookie it answers 400 "refreshToken required"
// without touching the network, so 400 means "the guard let this through" and
// 403 means "the guard stopped it".
//
// Unit coverage for every branch of the guard itself (Referer fallback,
// opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
// packages/user/src/server/__tests__/csrfGuard.test.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF origin guard', () => {
  const OWN_ORIGIN = 'https://storygeek.clintgeek.com';
  const EVIL_ORIGIN = 'https://evil.example';

  test('a cookie-authenticated mutation from an allow-listed origin reaches the route', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader('some-token'))
      .set('Origin', OWN_ORIGIN)
      .send({});

    expect(res.status).toBe(400);
  });

  test('the same mutation from a foreign origin is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader('some-token'))
      .set('Origin', EVIL_ORIGIN)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
  });

  test('a foreign Referer with no Origin is rejected too', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader('some-token'))
      .set('Referer', `${EVIL_ORIGIN}/attack.html`)
      .send({});

    expect(res.status).toBe(403);
  });

  test('a cookie-authenticated mutation with no Origin and no Referer passes', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader('some-token'))
      .send({});

    expect(res.status).toBe(400);
  });

  test('a GET from a foreign origin is not blocked by the guard — mutations only', async () => {
    const res = await request(app)
      .get('/api/stories/story-1')
      .set('Cookie', cookieHeader('garbage'))
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).not.toBe(403);
  });

  test('an unauthenticated mutation is not the guard\'s business', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', EVIL_ORIGIN)
      .send({});

    expect(res.status).not.toBe(403);
  });
});
