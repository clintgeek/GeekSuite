/**
 * goingOverAuth.test.js — pinning tests for the auth / identity half of the
 * 2026-09-05 going-over.
 *
 * Same architecture as auth.test.js: redis is mocked via
 * `jest.unstable_mockModule` before anything that imports it, a minimal
 * Express app carries only the auth routes, and MongoMemoryServer is managed
 * by globalSetup / globalTeardown.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';

import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();
jest.unstable_mockModule('redis', () => ({ createClient: () => fakeRedisClient }));

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { buildTestApp } = await import('./testHelpers.js');
const { initRefreshTokenStore, closeRefreshTokenStore } = await import('../services/refreshTokenStore.js');

let app;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

/** Wait until the wall clock has crossed into the next whole second. */
const waitForNextSecond = () =>
  new Promise((resolve) => setTimeout(resolve, 1000 - (Date.now() % 1000) + 25));

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.USERGEEK_MONGODB_URI);
  await initRefreshTokenStore();
  app = buildTestApp();
}, 60000);

afterAll(async () => {
  await closeRefreshTokenStore();
  await User.deleteMany({ username: /^going_over_/ }).catch(() => {});
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('a username with a capital letter can log in', () => {
  /**
   * `email` is declared `lowercase: true`, so its stored form IS the lowered
   * form. `username` is only trimmed — but login searched
   * `{ username: identifier.toLowerCase() }` for it, so an account registered
   * as "Chef" could never be reached by username at all. The only reason this
   * was survivable is that most accounts also carry an email.
   */
  it('logs in by the exact-case username it registered with', async () => {
    const username = `Going_Over_Mixed_${uniq()}`;
    await User.create({ username, passwordHash: 'correct horse battery' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'correct horse battery', app: 'basegeek' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(username);
  });

  it('still logs in by an all-lowercase username, and by email', async () => {
    const username = `going_over_lower_${uniq()}`;
    const email = `going.over.${uniq()}@example.com`;
    await User.create({ username, email, passwordHash: 'hunter22' });

    const byName = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'hunter22', app: 'basegeek' });
    expect(byName.status).toBe(200);

    // Email lookup is case-insensitive because the column is lowercased.
    const byEmail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email.toUpperCase(), password: 'hunter22', app: 'basegeek' });
    expect(byEmail.status).toBe(200);
  });

  it('answers a non-string identifier as a failed login, not a 500', async () => {
    // `{"identifier": {"$ne": null}}` used to reach `.toLowerCase()` and throw
    // a TypeError, which the route reported as a 500 — a type oracle, and a
    // different answer from a wrong password.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: 'whatever', app: 'basegeek' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('changing a password ends every other session', () => {
  /**
   * Refresh tokens live 30 days and were only ever revoked by family (logout,
   * or reuse detection). Nothing tied one to the credential it was minted
   * against, so `POST /auth/reset-password` left every other live session —
   * including the attacker's, who is the entire reason someone changes a
   * password — refreshing happily for another month.
   */
  const login = (identifier, password) =>
    request(app).post('/api/auth/login').send({ identifier, password, app: 'basegeek' });

  it('a refresh token minted before the change stops working', async () => {
    const username = `going_over_pwchange_${uniq()}`;
    await User.create({ username, passwordHash: 'old-password-1' });

    // Two independent sessions — "this browser" and "the other one".
    const sessionA = await login(username, 'old-password-1');
    const sessionB = await login(username, 'old-password-1');
    expect(sessionA.status).toBe(200);
    expect(sessionB.status).toBe(200);

    // Cross a whole-second boundary first. `passwordChangedAt` is compared at
    // the resolution of a JWT `iat`, which is whole seconds, so a token minted
    // in the SAME second as the change is deliberately kept — see the note in
    // rotateRefreshToken. Without this wait the test races that tolerance.
    await waitForNextSecond();

    // Session A changes the password.
    const changed = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', `Bearer ${sessionA.body.token}`)
      .send({ newPassword: 'new-password-2' });
    expect(changed.status).toBe(200);

    // Session B's refresh token predates the change and is refused.
    const refreshB = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionB.body.refreshToken, app: 'basegeek' });
    expect(refreshB.status).toBe(401);
    // It travels the reuse path deliberately: that branch is the one that
    // clears the SSO cookies, which is exactly what should happen to a session
    // whose credential has been changed out from under it.
    expect(refreshB.body.code).toBe('REFRESH_REUSE');
    const cleared = (refreshB.headers['set-cookie'] || []).join(';');
    expect(cleared).toMatch(/geek_refresh_token=;/);

    // And the new password is what works now.
    expect((await login(username, 'new-password-2')).status).toBe(200);
    expect((await login(username, 'old-password-1')).status).toBe(401);

    // The session that MADE the change is re-issued rather than logged out —
    // being bounced to the login screen by your own password change is a bug,
    // not a security feature.
    expect(changed.body.refreshToken).toBeTruthy();
    const refreshA = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: changed.body.refreshToken, app: 'basegeek' });
    expect(refreshA.status).toBe(200);
  });

  it('a session started AFTER the change refreshes normally', async () => {
    // The guard must not be a blanket "no refreshes ever again".
    const username = `going_over_pwafter_${uniq()}`;
    await User.create({ username, passwordHash: 'first-password' });

    const before = await login(username, 'first-password');
    await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', `Bearer ${before.body.token}`)
      .send({ newPassword: 'second-password' });

    const after = await login(username, 'second-password');
    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: after.body.refreshToken, app: 'basegeek' });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();
  });

  it('a brand-new registration can refresh immediately', async () => {
    // The stamp is set on creation too, and `iat` has second resolution — so
    // a token minted in the same second as the save must NOT be caught by its
    // own stamp.
    const username = `going_over_freshreg_${uniq()}`;
    const registered = await request(app).post('/api/auth/register').send({
      username,
      email: `${username}@example.com`,
      password: 'brand-new-password',
      app: 'basegeek',
    });
    expect(registered.status).toBe(201);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken, app: 'basegeek' });
    expect(refreshed.status).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/register validates the app it is asked to mint for', () => {
  /**
   * `authenticateToken` rejects a token whose `app` claim is outside
   * VALID_APPS (403 "Invalid app token"), and login validates `app` before it
   * mints. Register did not — so registering with a typo'd app returned 201
   * and a session that every single route then refused.
   */
  it('refuses an app that is not one of ours', async () => {
    const username = `going_over_badapp_${uniq()}`;
    const res = await request(app).post('/api/auth/register').send({
      username,
      email: `${username}@example.com`,
      password: 'password123',
      app: 'notarealgeek',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid app/i);
    expect(await User.countDocuments({ username })).toBe(0);
  });

  it('accepts a valid app in any case', async () => {
    const username = `going_over_okapp_${uniq()}`;
    const res = await request(app).post('/api/auth/register').send({
      username,
      email: `${username}@example.com`,
      password: 'password123',
      app: 'BujoGeek',
    });
    expect(res.status).toBe(201);
  });

  it('still accepts a registration that names no app at all', async () => {
    // notegeek's frontend and several consumer proxies omit it, and a token
    // with no app claim is valid by design — so this must NOT become a 400.
    const username = `going_over_noapp_${uniq()}`;
    const res = await request(app).post('/api/auth/register').send({
      username,
      email: `${username}@example.com`,
      password: 'password123',
    });
    expect(res.status).toBe(201);
  });
});
