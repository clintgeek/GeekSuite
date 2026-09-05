/**
 * csrfToken.test.js — basegeek's double-submit CSRF token.
 *
 * The Origin guard (csrfGuard.test.js) closes third-party CSRF. It cannot
 * close *sibling-subdomain* CSRF against basegeek, because basegeek's origin
 * allow-list has to contain every app in the suite. This file covers the
 * control that does: a cookie-authenticated mutation must echo the `geek_csrf`
 * cookie back in `X-CSRF-Token`.
 *
 * Two halves:
 *
 *   1. The guard's decision table, on a stub app that mirrors server.js's
 *      mount order. server.js cannot be imported (it connects Mongo, aiGeek
 *      and Redis, starts Apollo and binds a port at module scope), so the
 *      mount is reproduced rather than imported — the same shape
 *      csrfGuard.test.js uses.
 *   2. Issuance and rotation, against the *real* auth routes on the real
 *      in-memory Mongo, because "the token is set on login and rotated with
 *      the refresh token" is a claim about routes/auth.js, not about the
 *      middleware.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// ── Redis mock must be registered before anything that imports redis ─────────
import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();

jest.unstable_mockModule('redis', () => ({
  createClient: () => fakeRedisClient,
}));

// ── Dynamic imports — after mock registration ────────────────────────────────
const { default: mongoose } = await import('mongoose');
const { userGeekConn } = await import('../models/user.js');
const { buildTestApp, createTestUser } = await import('./testHelpers.js');
const { initRefreshTokenStore, closeRefreshTokenStore } = await import('../services/refreshTokenStore.js');
const {
  csrfTokenGuard,
  ensureCsrfCookie,
  generateCsrfToken,
  resolveTokenMode,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} = await import('../middleware/csrfToken.js');
const { csrfGuard } = await import('@geeksuite/user/server');
const { resolveAllowedOrigins } = await import('../lib/corsOrigins.js');

const SESSION_COOKIE = 'geek_token=a-valid-jwt';
const TOKEN = 'oO2xk5Yz1QqFbn-8LmvTz7cRk2sQeWpUvHgJdNaBcDe';
const OTHER_TOKEN = 'ZZZZZ5Yz1QqFbn-8LmvTz7cRk2sQeWpUvHgJdNaBcDe';

let reached;

/**
 * server.js's order, with stub routes behind it: csrfTokenGuard runs in front
 * of everything (including /graphql), then cookieParser, then ensureCsrfCookie.
 *
 * `env` is threaded into the guard so a CSRF_TOKEN value in the ambient
 * environment cannot change what these tests measure.
 */
function buildGuardApp({ env = {}, mode } = {}) {
  const app = express();
  app.use(csrfTokenGuard({ appName: 'basegeek', env, ...(mode ? { mode } : {}) }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(ensureCsrfCookie({ env: { NODE_ENV: 'test' } }));

  app.post('/graphql', (req, res) => {
    reached.push(`graphql:${ req.body?.operationName ?? 'anonymous' }`);
    res.json({ data: { ok: true } });
  });
  app.get('/graphql', (req, res) => {
    reached.push('graphql-get');
    res.json({ data: { ok: true } });
  });
  app.post('/api/users/preferences', (req, res) => {
    reached.push('rest');
    res.json({ ok: true });
  });
  app.delete('/api/users/1', (req, res) => {
    reached.push('delete');
    res.json({ ok: true });
  });
  app.get('/api/users/me', (req, res) => {
    reached.push('me');
    res.json({ ok: true });
  });
  app.post('/openai/v1/chat/completions', (req, res) => {
    reached.push('openai');
    res.json({ ok: true });
  });
  app.post('/api/ai/call', (req, res) => {
    reached.push('ai');
    res.json({ ok: true });
  });

  return app;
}

/** Extract cookies from a supertest response into a plain object. */
function parseCookies(res) {
  const cookies = {};
  for (const str of res.headers['set-cookie'] || []) {
    const [pair] = str.split(';');
    const [name, ...rest] = pair.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  }
  return cookies;
}

/** The raw Set-Cookie line for one cookie, so attributes can be asserted. */
function rawCookie(res, name) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${ name }=`)) || '';
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. The guard
// ═════════════════════════════════════════════════════════════════════════════

describe('csrfTokenGuard — the decision table', () => {
  let app;

  beforeEach(() => {
    reached = [];
    app = buildGuardApp({ mode: 'enforce' });
  });

  it('lets a mutation through when the header matches the cookie', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set(CSRF_HEADER_NAME, TOKEN)
      .send({ operationName: 'CreateTask', query: 'mutation CreateTask { createTask { id } }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:CreateTask']);
  });

  it('rejects a cookie-authenticated mutation with no header at all', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { x }' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_token_missing' });
    expect(reached).toEqual([]);
  });

  it('rejects a header that does not match the cookie', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set(CSRF_HEADER_NAME, OTHER_TOKEN)
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { x }' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_token_invalid' });
    expect(reached).toEqual([]);
  });

  it('rejects a header that is a prefix of the cookie (no length-based shortcut)', async () => {
    const res = await request(app)
      .post('/api/users/preferences')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set(CSRF_HEADER_NAME, TOKEN.slice(0, 10))
      .send({ theme: 'dark' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_token_invalid' });
  });

  it('guards DELETE as well as POST', async () => {
    const res = await request(app)
      .delete('/api/users/1')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`]);

    expect(res.status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('never checks a GET, however foreign', async () => {
    const res = await request(app)
      .get('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`]);

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql-get']);
  });

  it('never checks a POST that carries no session cookie', async () => {
    const res = await request(app)
      .post('/graphql')
      .send({ operationName: 'PublicQuery', query: '{ apps { id } }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:PublicQuery']);
  });

  it('exempts the API-key OpenAI proxy by construction — a key client sends no cookie', async () => {
    const res = await request(app)
      .post('/openai/v1/chat/completions')
      .set('Authorization', `Bearer bg_${ 'a'.repeat(64) }`)
      .send({ model: 'gpt-4', messages: [] });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['openai']);
  });

  it('exempts key-authenticated /api/ai the same way', async () => {
    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer bg_${ 'a'.repeat(64) }`)
      .send({ prompt: 'hi' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['ai']);
  });

  it('does NOT let a bearer header buy an exemption when a session cookie is also present', async () => {
    // basegeek's authenticateToken is cookie-first, so treating "has a bearer
    // header" as an exemption would let any caller opt out of the check with a
    // junk Authorization value while riding the victim's cookie.
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set('Authorization', 'Bearer not-a-real-key')
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { x }' });

    expect(res.status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('allows a session that predates the rollout — no geek_csrf cookie, nothing to compare', async () => {
    // A third-party page cannot make the browser omit a cookie it holds, so
    // this branch is only reachable by a session that has not been issued one
    // yet. ensureCsrfCookie issues one on this very response.
    const res = await request(app)
      .post('/api/users/preferences')
      .set('Cookie', [SESSION_COOKIE])
      .send({ theme: 'dark' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['rest']);
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toBeTruthy();
  });
});

describe('CSRF_TOKEN lever', () => {
  beforeEach(() => {
    reached = [];
  });

  it('defaults to report — deploying this cannot break a client that has no header yet', async () => {
    const app = buildGuardApp({ env: {} });

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .send({ operationName: 'CreateTask', query: 'mutation CreateTask { x }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:CreateTask']);
  });

  it('CSRF_TOKEN=report lets a mismatched token through too', async () => {
    const app = buildGuardApp({ env: { CSRF_TOKEN: 'report' } });

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set(CSRF_HEADER_NAME, OTHER_TOKEN)
      .send({ operationName: 'CreateTask', query: 'mutation CreateTask { x }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:CreateTask']);
  });

  it('CSRF_TOKEN=enforce blocks it', async () => {
    const app = buildGuardApp({ env: { CSRF_TOKEN: 'enforce' } });

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .send({ operationName: 'CreateTask', query: 'mutation CreateTask { x }' });

    expect(res.status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('CSRF_TOKEN=off is a no-op', async () => {
    const app = buildGuardApp({ env: { CSRF_TOKEN: 'off' } });

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`])
      .set(CSRF_HEADER_NAME, OTHER_TOKEN)
      .send({ operationName: 'CreateTask', query: 'mutation CreateTask { x }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:CreateTask']);
  });

  it('an unrecognized value falls back to report, not enforce', () => {
    // The opposite of CSRF_GUARD's rule, on purpose: this control is new and a
    // typo must not start 403-ing production mutations.
    expect(resolveTokenMode('banana')).toBe('report');
    expect(resolveTokenMode(undefined)).toBe('report');
    expect(resolveTokenMode('')).toBe('report');
    expect(resolveTokenMode('ENFORCE')).toBe('enforce');
    expect(resolveTokenMode('Off')).toBe('off');
  });
});

describe('generateCsrfToken', () => {
  it('is 32 bytes of base64url', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCsrfToken()));
    expect(seen.size).toBe(200);
  });
});

describe('ensureCsrfCookie', () => {
  beforeEach(() => {
    reached = [];
  });

  it('back-fills the token on a plain GET of /api/users/me', async () => {
    const app = buildGuardApp();

    const res = await request(app).get('/api/users/me').set('Cookie', [SESSION_COOKIE]);

    expect(res.status).toBe(200);
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('issues nothing for an anonymous request', async () => {
    const app = buildGuardApp();

    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(200);
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toBeUndefined();
  });

  it('never overwrites a token the session already has — two tabs must not race', async () => {
    const app = buildGuardApp();

    const res = await request(app)
      .get('/api/users/me')
      .set('Cookie', [SESSION_COOKIE, `${ CSRF_COOKIE_NAME }=${ TOKEN }`]);

    expect(res.status).toBe(200);
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Issuance and rotation, against the real auth routes
// ═════════════════════════════════════════════════════════════════════════════

describe('routes/auth.js issues and rotates the token', () => {
  let app;

  beforeAll(async () => {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.USERGEEK_MONGODB_URI);
    }
    await initRefreshTokenStore();
    app = buildTestApp();
  });

  afterAll(async () => {
    await closeRefreshTokenStore();
    await userGeekConn.close();
  });

  const login = (identifier, password) =>
    request(app).post('/api/auth/login').send({ identifier, password, app: 'basegeek' });

  it('sets geek_csrf alongside the SSO cookies on login', async () => {
    await createTestUser({ email: 'csrf-login@example.com', password: 'password123' });

    const res = await login('csrf-login@example.com', 'password123');

    expect(res.status).toBe(200);
    const cookies = parseCookies(res);
    expect(cookies.geek_token).toBeTruthy();
    expect(cookies[CSRF_COOKIE_NAME]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('issues it NOT HttpOnly — the page has to read it to echo it back', async () => {
    await createTestUser({ email: 'csrf-attrs@example.com', password: 'password123' });

    const res = await login('csrf-attrs@example.com', 'password123');
    const line = rawCookie(res, CSRF_COOKIE_NAME);

    expect(line).toBeTruthy();
    expect(line).not.toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    // The SSO cookies it rides alongside stay HttpOnly.
    expect(rawCookie(res, 'geek_token')).toMatch(/HttpOnly/i);
  });

  it('rotates it with the refresh token', async () => {
    await createTestUser({ email: 'csrf-rotate@example.com', password: 'password123' });
    const loginRes = await login('csrf-rotate@example.com', 'password123');
    const firstToken = parseCookies(loginRes)[CSRF_COOKIE_NAME];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken, app: 'basegeek' });

    expect(refreshRes.status).toBe(200);
    const secondToken = parseCookies(refreshRes)[CSRF_COOKIE_NAME];

    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).not.toBe(firstToken);
  });

  it('sets one on register too', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: `csrf-reg-${ Date.now() }`,
      email: `csrf-reg-${ Date.now() }@example.com`,
      password: 'password123',
      app: 'basegeek',
    });

    expect(res.status).toBe(201);
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('clears it on logout, so a stale token cannot outlive the session', async () => {
    await createTestUser({ email: 'csrf-logout@example.com', password: 'password123' });
    const loginRes = await login('csrf-logout@example.com', 'password123');

    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: loginRes.body.refreshToken });

    expect(res.status).toBe(200);
    expect(rawCookie(res, CSRF_COOKIE_NAME)).toBeTruthy();
    expect(parseCookies(res)[CSRF_COOKIE_NAME]).toBe('');
  });

  it('clears it when refresh-token reuse revokes the family', async () => {
    await createTestUser({ email: 'csrf-reuse@example.com', password: 'password123' });
    const loginRes = await login('csrf-reuse@example.com', 'password123');
    const stolen = loginRes.body.refreshToken;

    await request(app).post('/api/auth/refresh').send({ refreshToken: stolen, app: 'basegeek' });
    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: stolen, app: 'basegeek' });

    expect(replay.status).toBe(401);
    expect(parseCookies(replay)[CSRF_COOKIE_NAME]).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. The proxied refresh — what the enforce flip actually rests on
// ═════════════════════════════════════════════════════════════════════════════

describe('a consumer backend proxying /auth/refresh (BURN_REVIEW #3)', () => {
  // Six consumer backends expose POST /api/auth/{refresh,logout} as thin
  // proxies: the browser calls its own app's backend, the backend replays the
  // browser's Cookie (and, since this fix, X-CSRF-Token) up to basegeek with
  // axios, and hands the Set-Cookie back down.
  //
  // That upstream call is NOT a browser request. It carries no Origin and no
  // Referer, so csrfGuard's documented step 4 ("neither header present ->
  // pass", packages/user/src/server/csrfGuard.js) lets it through and the
  // double-submit token is the only control standing in front of it. These
  // tests pin exactly what flipping CSRF_TOKEN=enforce depends on, with both
  // guards mounted in server.js's order.

  const PROXY_COOKIE = `geek_token=a-valid-jwt; geek_refresh_token=r3fr3sh; ${ CSRF_COOKIE_NAME }=${ TOKEN }`;

  /** server.js's order: csrfGuard, then csrfTokenGuard, then the routes. */
  function buildProxiedApp({ mode = 'enforce' } = {}) {
    const app = express();
    app.use(csrfGuard({
      allowedOrigins: resolveAllowedOrigins({ NODE_ENV: 'production' }).origins,
      appName: 'basegeek',
      env: {},
    }));
    app.use(csrfTokenGuard({ appName: 'basegeek', env: {}, mode }));
    app.use(express.json());
    app.use(cookieParser());
    app.post('/api/auth/refresh', (req, res) => {
      reached.push('refresh');
      res.json({ token: 'new.jwt' });
    });
    app.post('/api/auth/logout', (req, res) => {
      reached.push('logout');
      res.json({ success: true });
    });
    return app;
  }

  beforeEach(() => {
    reached = [];
  });

  it('accepts the double-submit pair from an originless server-to-server call', async () => {
    const res = await request(buildProxiedApp())
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .set(CSRF_HEADER_NAME, TOKEN)
      .send({ app: 'bujogeek' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['refresh']);
  });

  it('accepts it on /auth/logout too', async () => {
    const res = await request(buildProxiedApp())
      .post('/api/auth/logout')
      .set('Cookie', PROXY_COOKIE)
      .set(CSRF_HEADER_NAME, TOKEN)
      .send({});

    expect(res.status).toBe(200);
    expect(reached).toEqual(['logout']);
  });

  it('rejects the same call when the proxy drops the header — the bug this fix closes', async () => {
    // This is the pre-fix behavior of all six proxies: cookies replayed, token
    // left behind. Under enforce it is a 403 on every refresh, which
    // @geeksuite/auth reads as session-expired.
    const res = await request(buildProxiedApp())
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .send({ app: 'bujogeek' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_token_missing' });
    expect(reached).toEqual([]);
  });

  it('rejects a pre-rotation token replayed after a refresh (BURN_REVIEW #17)', async () => {
    // The cookie has rotated; the client replayed the header it built the
    // request with. Nothing about coming through a proxy softens this, which
    // is why the fix has to be in @geeksuite/auth's request interceptor.
    const res = await request(buildProxiedApp())
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .set(CSRF_HEADER_NAME, OTHER_TOKEN)
      .send({ app: 'bujogeek' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_token_invalid' });
  });

  it('still accepts the pair when the proxy does forward a suite Origin', async () => {
    // Not what axios does today, but a proxy that passed Origin through would
    // be sending a sibling app's origin — which is on basegeek's allow-list by
    // necessity, so the origin guard cannot be what protects this path either.
    const res = await request(buildProxiedApp())
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .set('Origin', 'https://bujogeek.clintgeek.com')
      .set(CSRF_HEADER_NAME, TOKEN)
      .send({ app: 'bujogeek' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['refresh']);
  });

  it('a Referer from a suite app is no different', async () => {
    const res = await request(buildProxiedApp())
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .set('Referer', 'https://notegeek.clintgeek.com/notes/42')
      .set(CSRF_HEADER_NAME, TOKEN)
      .send({ app: 'notegeek' });

    expect(res.status).toBe(200);
  });

  it('report mode lets the header-less proxy call through — today, before the flip', async () => {
    const res = await request(buildProxiedApp({ mode: 'report' }))
      .post('/api/auth/refresh')
      .set('Cookie', PROXY_COOKIE)
      .send({ app: 'bujogeek' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['refresh']);
  });
});
