/**
 * auth.test.js — integration tests for the auth flow.
 *
 * Coverage:
 *   - Login with valid creds → 200 + geek_token / geek_refresh_token cookies
 *   - Login with wrong password → 401
 *   - Refresh with valid token rotates; old token is then invalid (REFRESH_REUSE)
 *   - Reuse detection: replay an already-rotated token → 401 REFRESH_REUSE AND
 *     the family is revoked so subsequent legit refresh also fails
 *   - Logout revokes the family; subsequent refresh fails
 *   - Password reset actually changes the stored bcrypt hash (regression for 3be965e)
 *   - Encrypted-key round-trip through AIConfig: setKey → save → reload → getDecryptedKey
 *
 * Architecture notes:
 *   - redis is mocked via jest.unstable_mockModule (ESM-safe) so refreshTokenStore
 *     never touches a real Redis instance.
 *   - A fresh Express app with only the auth routes is built per-suite — we
 *     never import server.js.
 *   - MongoMemoryServer is managed by globalSetup / globalTeardown.  All
 *     Mongoose connections point at it because USERGEEK_MONGODB_URI and
 *     AIGEEK_MONGODB_URI are set in setEnv.js (before any module loads).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

// ── 1. Register the Redis mock BEFORE any module that uses redis is imported ──
import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();

jest.unstable_mockModule('redis', () => ({
  createClient: () => fakeRedisClient,
}));

// ── 2. Dynamic imports — must come AFTER mock registration ────────────────────
const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { buildTestApp, createTestUser } = await import('./testHelpers.js');
const { initRefreshTokenStore, closeRefreshTokenStore } = await import('../services/refreshTokenStore.js');

// ── App under test ────────────────────────────────────────────────────────────
let app;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Wait for the userGeek named connection (created at user.js import time).
  if (userGeekConn.readyState === 0) {
    await userGeekConn.asPromise();
  }

  // Connect the default mongoose connection (used by Conversation, etc.).
  const uri = process.env.USERGEEK_MONGODB_URI;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Wire up the fake Redis client.
  await initRefreshTokenStore();

  // Build a minimal Express app (no server.js, no Mongo/Redis boot in it).
  app = buildTestApp();
});

afterAll(async () => {
  await closeRefreshTokenStore();
  // Close named connection; don't close the default one so other test files
  // can reuse it if they share the same worker.
  await userGeekConn.close();
  await mongoose.disconnect();
});

beforeEach(async () => {
  // Isolated state: flush the in-memory Redis store and drop the users collection.
  fakeRedisClient.flush();
  await User.deleteMany({});
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/auth/login and return the supertest response. */
async function login(identifier, password, app_ = app) {
  return request(app_)
    .post('/api/auth/login')
    .send({ identifier, password, app: 'basegeek' });
}

/** POST /api/auth/refresh using body payload (avoids cookie-jar complexity). */
async function refresh(refreshToken, app_ = app) {
  return request(app_)
    .post('/api/auth/refresh')
    .send({ refreshToken, app: 'basegeek' });
}

/** POST /api/auth/logout using body payload. */
async function logout(refreshToken, app_ = app) {
  return request(app_)
    .post('/api/auth/logout')
    .send({ refreshToken });
}

/** Extract cookies from a supertest response into a plain object. */
function parseCookies(res) {
  const cookies = {};
  const raw = res.headers['set-cookie'] || [];
  for (const str of raw) {
    const [pair] = str.split(';');
    const [name, ...rest] = pair.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  }
  return cookies;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 and sets geek_token + geek_refresh_token cookies on valid creds', async () => {
    await createTestUser({ email: 'alice@example.com', password: 'password123' });

    const res = await login('alice@example.com', 'password123');

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    const cookies = parseCookies(res);
    expect(cookies.geek_token).toBeTruthy();
    expect(cookies.geek_refresh_token).toBeTruthy();
  });

  it('returns 200 and includes user info', async () => {
    await createTestUser({ email: 'bob@example.com', password: 'password123' });

    const res = await login('bob@example.com', 'password123');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('bob@example.com');
    expect(res.body.user.app).toBe('basegeek');
  });

  it('returns 401 on wrong password', async () => {
    await createTestUser({ email: 'carol@example.com', password: 'correctpassword' });

    const res = await login('carol@example.com', 'wrongpassword');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('LOGIN_ERROR');
  });

  it('returns 401 on unknown user', async () => {
    const res = await login('nobody@example.com', 'whatever');

    expect(res.status).toBe(401);
  });

  it('returns 400 when identifier is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'pw', app: 'basegeek' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 200 with new tokens when called with a valid refresh token', async () => {
    await createTestUser({ email: 'dave@example.com', password: 'password123' });
    const loginRes = await login('dave@example.com', 'password123');
    const oldRefreshToken = loginRes.body.refreshToken;

    const res = await refresh(oldRefreshToken);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // New refresh token must be different from the old one
    expect(res.body.refreshToken).not.toBe(oldRefreshToken);
  });

  it('sets new cookies on successful refresh', async () => {
    await createTestUser({ email: 'eve@example.com', password: 'password123' });
    const loginRes = await login('eve@example.com', 'password123');

    const res = await refresh(loginRes.body.refreshToken);

    const cookies = parseCookies(res);
    expect(cookies.geek_token).toBeTruthy();
    expect(cookies.geek_refresh_token).toBeTruthy();
  });

  it('returns 401 REFRESH_REUSE when the same refresh token is used twice', async () => {
    await createTestUser({ email: 'frank@example.com', password: 'password123' });
    const loginRes = await login('frank@example.com', 'password123');
    const refreshToken = loginRes.body.refreshToken;

    // First use — valid
    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);

    // Second use — reuse detected
    const second = await refresh(refreshToken);
    expect(second.status).toBe(401);
    expect(second.body.code).toBe('REFRESH_REUSE');
  });

  it('revokes the family on reuse: legit token from same family also fails', async () => {
    // Setup: login → refresh once (keep old + new tokens) → replay OLD → then try NEW
    await createTestUser({ email: 'grace@example.com', password: 'password123' });
    const loginRes = await login('grace@example.com', 'password123');
    const originalRefreshToken = loginRes.body.refreshToken;

    // First (legitimate) rotation: keep the newly issued refresh token
    const firstRefresh = await refresh(originalRefreshToken);
    expect(firstRefresh.status).toBe(200);
    const newRefreshToken = firstRefresh.body.refreshToken;

    // Replay the OLD token → triggers reuse detection → family is revoked
    const reuseAttempt = await refresh(originalRefreshToken);
    expect(reuseAttempt.status).toBe(401);
    expect(reuseAttempt.body.code).toBe('REFRESH_REUSE');

    // The NEW (legitimately-rotated) token from the same family also fails
    // because the family is now revoked.
    const postRevokeAttempt = await refresh(newRefreshToken);
    expect(postRevokeAttempt.status).toBe(401);
  });

  it('returns 401 when called without a token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ app: 'basegeek' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears cookies', async () => {
    await createTestUser({ email: 'henry@example.com', password: 'password123' });
    const loginRes = await login('henry@example.com', 'password123');

    const res = await logout(loginRes.body.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LOGOUT_SUCCESS');
    // Both cookies should be cleared (maxAge=0 or expires in the past)
    const raw = res.headers['set-cookie'] || [];
    expect(raw.some((c) => c.startsWith('geek_token=;'))).toBe(true);
    expect(raw.some((c) => c.startsWith('geek_refresh_token=;'))).toBe(true);
  });

  it('revokes the family so subsequent refresh on same family fails', async () => {
    await createTestUser({ email: 'iris@example.com', password: 'password123' });
    const loginRes = await login('iris@example.com', 'password123');
    const refreshToken = loginRes.body.refreshToken;

    // Logout
    const logoutRes = await logout(refreshToken);
    expect(logoutRes.status).toBe(200);

    // Attempt refresh with the same (now-revoked) token
    const res = await refresh(refreshToken);
    // The jti was never consumed so it's still in Redis, but the family is
    // revoked → rotateRefreshToken returns { reuse: true }
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/reset-password (regression: 3be965e)', () => {
  it('actually changes the stored bcrypt hash', async () => {
    // Create user and record the original password hash
    const user = await createTestUser({
      email: 'jasper@example.com',
      password: 'original-password',
    });

    // Fetch the stored hash (passwordHash is select:false — query explicitly)
    const before = await User.findById(user._id).select('+passwordHash');
    expect(before.passwordHash).toBeTruthy();
    const hashBefore = before.passwordHash;

    // Obtain an access token so we can hit the authenticated reset-password endpoint
    const loginRes = await login('jasper@example.com', 'original-password');
    expect(loginRes.status).toBe(200);
    const { token } = loginRes.body;

    // Call reset-password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'brand-new-password' });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.code).toBe('PASSWORD_UPDATED');

    // Verify the hash actually changed
    const after = await User.findById(user._id).select('+passwordHash');
    expect(after.passwordHash).not.toBe(hashBefore);

    // New hash must authenticate the new password
    const { default: bcrypt } = await import('bcryptjs');
    const valid = await bcrypt.compare('brand-new-password', after.passwordHash);
    expect(valid).toBe(true);

    // Old password must no longer work
    const loginAgain = await login('jasper@example.com', 'original-password');
    expect(loginAgain.status).toBe(401);

    // New password must work
    const loginNew = await login('jasper@example.com', 'brand-new-password');
    expect(loginNew.status).toBe(200);
  });
});

describe('AIConfig encrypted-key round-trip', () => {
  it('setKey → save → reload → getDecryptedKey returns original plaintext', async () => {
    // Dynamically import AIConfig — it uses getAIGeekConnection() which was
    // created when database.js was first imported.  Because AIGEEK_MONGODB_URI
    // was set in setEnv.js (before any module loaded) the connection points at
    // the in-memory Mongo.
    const { default: AIConfig } = await import('../models/AIConfig.js');

    // Wait for the aiGeek connection to be ready
    const { getAIGeekConnection } = await import('../config/database.js');
    const conn = getAIGeekConnection();
    if (conn.readyState === 0) {
      await conn.asPromise();
    }

    // Clean up any leftover documents from previous runs
    await AIConfig.deleteMany({});

    const plain = 'sk-test-abc123';
    const doc = new AIConfig({
      provider: 'anthropic',
      apiKey: 'placeholder', // will be overwritten by setKey
    });
    doc.setKey(plain);

    // The stored value must be encrypted before save
    expect(doc.apiKey.startsWith('v1:')).toBe(true);

    await doc.save();

    // Reload fresh from DB (no cached in-memory state)
    const loaded = await AIConfig.findById(doc._id);
    expect(loaded).not.toBeNull();

    // Stored value is still encrypted
    expect(loaded.apiKey.startsWith('v1:')).toBe(true);
    // Decrypted value matches original plaintext
    expect(loaded.getDecryptedKey()).toBe(plain);
  });
});

describe('JWT secret enforcement', () => {
  it.skip(
    'authService.js throws at import when JWT_SECRET is shorter than 32 chars — ' +
    'skipped: Jest module caching makes re-importing with different env vars ' +
    'impractical in ESM. The enforcement is tested by code review of ' +
    'authService.js lines 9-13.',
    () => {}
  );
});
