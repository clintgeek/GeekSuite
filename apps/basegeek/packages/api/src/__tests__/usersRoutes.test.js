/**
 * usersRoutes.test.js — ROUTE-level integration tests for src/routes/user.js.
 *
 * appPreferences.test.js already pins the helper layer (src/lib/appPreferences.js).
 * This suite drives the real Express router end-to-end via supertest, exercising
 * the HTTP surface every GeekSuite app depends on:
 *
 *   - PATCH /preferences/:app then GET /preferences/:app round-trips (the
 *     silent-write-failure regression, now at the HTTP layer).
 *   - App preferences are per-user isolated — a token for user A never reads or
 *     writes user B's data (the router keys everything off req.user.id).
 *   - Multiple apps' preferences never clobber one another over the wire.
 *   - Global /preferences and /profile round-trip and stay per-user.
 *   - Unauthenticated requests are rejected (401) on every private route.
 *
 * No Redis is needed — the user router never touches the refresh-token store.
 * Mongo is the in-memory instance from globalSetup; USERGEEK_MONGODB_URI points
 * at it via setEnv.js, so the User model's own connection lands there too.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: userRoutes } = await import('../routes/user.js');

// ── App under test: minimal Express with only the user router ────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // pino-http attaches req.log, which several user.js handlers call in catch blocks.
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: false,
  });
  app.use((req, res, next) => { httpLogger(req, res); next(); });
  app.use('/api/users', userRoutes);
  return app;
}

let app;
let seq = 0;

/** Create a real User and return { user, token } — token is a valid geek JWT. */
async function makeUserWithToken(overrides = {}) {
  const user = await User.create({
    username: `routes_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, token };
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  app = buildApp();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('app preferences — PATCH/GET /api/users/preferences/:app', () => {
  it('PATCH then GET round-trips a preference over HTTP', async () => {
    const { token } = await makeUserWithToken();

    const patch = await auth(request(app).patch('/api/users/preferences/notegeek'), token)
      .send({ editorFontSize: 16 });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ app: 'notegeek', preferences: { editorFontSize: 16 } });

    const get = await auth(request(app).get('/api/users/preferences/notegeek'), token);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ app: 'notegeek', preferences: { editorFontSize: 16 } });
  });

  it('a partial PATCH merges rather than replaces', async () => {
    const { token } = await makeUserWithToken();

    await auth(request(app).patch('/api/users/preferences/notegeek'), token)
      .send({ editorFontSize: 16 });
    await auth(request(app).patch('/api/users/preferences/notegeek'), token)
      .send({ theme: 'dark' });

    const get = await auth(request(app).get('/api/users/preferences/notegeek'), token);
    expect(get.body.preferences).toEqual({ editorFontSize: 16, theme: 'dark' });
  });

  it('writing a second app does not clobber the first', async () => {
    const { token } = await makeUserWithToken();

    await auth(request(app).patch('/api/users/preferences/notegeek'), token)
      .send({ editorFontSize: 16 });
    await auth(request(app).patch('/api/users/preferences/bujogeek'), token)
      .send({ dailyPageLayout: 'timeline' });

    const all = await auth(request(app).get('/api/users/preferences/apps'), token);
    expect(all.status).toBe(200);
    expect(all.body.appPreferences).toEqual({
      notegeek: { editorFontSize: 16 },
      bujogeek: { dailyPageLayout: 'timeline' },
    });
  });

  it('normalises the :app param to lowercase', async () => {
    const { token } = await makeUserWithToken();

    const patch = await auth(request(app).patch('/api/users/preferences/NoteGeek'), token)
      .send({ editorFontSize: 20 });
    expect(patch.body.app).toBe('notegeek');

    const get = await auth(request(app).get('/api/users/preferences/notegeek'), token);
    expect(get.body.preferences).toEqual({ editorFontSize: 20 });
  });

  it('GET for an app with no stored prefs returns an empty object', async () => {
    const { token } = await makeUserWithToken();
    const get = await auth(request(app).get('/api/users/preferences/notegeek'), token);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ app: 'notegeek', preferences: {} });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('app preferences — per-user isolation', () => {
  it("user A's writes are invisible to user B, and B's token only touches B's data", async () => {
    const a = await makeUserWithToken();
    const b = await makeUserWithToken();

    await auth(request(app).patch('/api/users/preferences/notegeek'), a.token)
      .send({ editorFontSize: 16, secret: 'a-only' });

    // B reads the same app namespace with B's token — sees nothing of A's.
    const bGet = await auth(request(app).get('/api/users/preferences/notegeek'), b.token);
    expect(bGet.body.preferences).toEqual({});

    // B writes its own value; A is unchanged.
    await auth(request(app).patch('/api/users/preferences/notegeek'), b.token)
      .send({ editorFontSize: 99 });

    const aGet = await auth(request(app).get('/api/users/preferences/notegeek'), a.token);
    expect(aGet.body.preferences).toEqual({ editorFontSize: 16, secret: 'a-only' });

    // And it's isolated in storage, not just in the response.
    const aReloaded = await User.findById(a.user._id);
    const bReloaded = await User.findById(b.user._id);
    expect(aReloaded.appPreferences.get('notegeek')).toEqual({ editorFontSize: 16, secret: 'a-only' });
    expect(bReloaded.appPreferences.get('notegeek')).toEqual({ editorFontSize: 99 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('global preferences — GET/PATCH /api/users/preferences', () => {
  it('PATCH then GET round-trips allowed global fields and is per-user', async () => {
    const a = await makeUserWithToken();
    const b = await makeUserWithToken();

    const patch = await auth(request(app).patch('/api/users/preferences'), a.token)
      .send({ theme: 'dark', accentColor: 'teal', bogusField: 'ignored' });
    expect(patch.status).toBe(200);
    expect(patch.body.preferences.theme).toBe('dark');
    expect(patch.body.preferences.accentColor).toBe('teal');
    expect(patch.body.preferences.bogusField).toBeUndefined();

    const aGet = await auth(request(app).get('/api/users/preferences'), a.token);
    expect(aGet.body.preferences.theme).toBe('dark');

    // B's global prefs are untouched by A's write (accentColor is A-distinctive;
    // theme happens to share the schema default so isn't a reliable isolation signal).
    const bGet = await auth(request(app).get('/api/users/preferences'), b.token);
    expect(bGet.body.preferences.accentColor).not.toBe('teal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('profile — GET/PATCH /api/users/profile', () => {
  it('PATCH merges allowed profile fields and round-trips per-user', async () => {
    const a = await makeUserWithToken();
    const b = await makeUserWithToken();

    const patch = await auth(request(app).patch('/api/users/profile'), a.token)
      .send({ displayName: 'Alice', bio: 'hi', notAllowed: 'nope' });
    expect(patch.status).toBe(200);
    expect(patch.body.profile.displayName).toBe('Alice');
    expect(patch.body.profile.bio).toBe('hi');
    expect(patch.body.profile.notAllowed).toBeUndefined();

    const aGet = await auth(request(app).get('/api/users/profile'), a.token);
    expect(aGet.body.profile.displayName).toBe('Alice');

    // B owns a separate profile — A's displayName never bleeds across.
    const bGet = await auth(request(app).get('/api/users/profile'), b.token);
    expect(bGet.body.profile.displayName).not.toBe('Alice');
  });

  it('bootstrap and /me return the caller\'s own identity + preferences', async () => {
    const { user, token } = await makeUserWithToken({ email: 'boot@example.com' });
    await auth(request(app).patch('/api/users/preferences'), token).send({ theme: 'light' });

    const boot = await auth(request(app).get('/api/users/bootstrap'), token);
    expect(boot.status).toBe(200);
    expect(boot.body.identity.id).toBe(user._id.toString());
    expect(boot.body.preferences.theme).toBe('light');

    const me = await auth(request(app).get('/api/users/me'), token);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user._id.toString());
    expect(me.body.user.email).toBe('boot@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('authentication is enforced on private routes', () => {
  const cases = [
    ['get', '/api/users/bootstrap'],
    ['get', '/api/users/me'],
    ['get', '/api/users/profile'],
    ['patch', '/api/users/profile'],
    ['get', '/api/users/preferences'],
    ['patch', '/api/users/preferences'],
    ['get', '/api/users/preferences/apps'],
    ['get', '/api/users/preferences/notegeek'],
    ['patch', '/api/users/preferences/notegeek'],
  ];

  it.each(cases)('rejects unauthenticated %s %s with 401', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a malformed/garbage token with 403', async () => {
    const res = await request(app)
      .get('/api/users/preferences/notegeek')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(403);
  });
});
