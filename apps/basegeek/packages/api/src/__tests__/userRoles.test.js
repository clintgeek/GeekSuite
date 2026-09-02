/**
 * userRoles.test.js — the admin role and the admin gate on the user routes.
 *
 * Covers:
 *   - `role` defaults to 'user' on a freshly created User.
 *   - GET /api/users (the cross-user list) is admin-only: 401 unauthenticated,
 *     403 { error: 'admin_required' } for a plain user, 200 for an admin.
 *   - POST /api/users and DELETE /api/users/:id are gated the same way.
 *   - Self routes (/me, /bootstrap, /profile, /preferences) stay open to any
 *     authenticated user.
 *   - GET /api/users/me reports the caller's role, and a promotion made in the
 *     DB takes effect on the NEXT request with the SAME token — the reason
 *     role is not in the JWT.
 *   - scripts/setUserRole.js's extracted setUserRole() logic.
 *
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
const { setUserRole, VALID_ROLES } = await import('../../scripts/setUserRole.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
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

/** Create a real User (optionally an admin) and return { user, token }. */
async function makeUserWithToken(overrides = {}) {
  const user = await User.create({
    username: `roles_user_${Date.now()}_${seq++}`,
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
describe('User.role schema field', () => {
  it("defaults to 'user' for a newly created user", async () => {
    const { user } = await makeUserWithToken();
    expect(user.role).toBe('user');

    const reloaded = await User.findById(user._id).lean();
    expect(reloaded.role).toBe('user');
  });

  it("accepts 'admin' and rejects anything outside the enum", async () => {
    const { user } = await makeUserWithToken({ role: 'admin' });
    expect(user.role).toBe('admin');

    await expect(
      User.create({ username: `roles_bad_${seq++}`, passwordHash: 'x', role: 'superuser' })
    ).rejects.toThrow();
  });

  it('is not carried in the JWT — the gate reads it from the DB', async () => {
    const { token } = await makeUserWithToken({ role: 'admin' });
    const decoded = jwt.decode(token);
    expect(decoded.role).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('admin gate — GET /api/users (the cross-user list)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it("rejects a plain user with 403 { error: 'admin_required' }", async () => {
    const { token } = await makeUserWithToken();
    const res = await auth(request(app).get('/api/users'), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
    expect(res.body.users).toBeUndefined();
  });

  it('allows an admin and returns the paginated list', async () => {
    const admin = await makeUserWithToken({ role: 'admin' });
    await makeUserWithToken();

    const res = await auth(request(app).get('/api/users'), admin.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users.map(u => u.role).sort()).toEqual(['admin', 'user']);
    // Never leak the hash, even to an admin.
    expect(res.body.users.every(u => u.passwordHash === undefined)).toBe(true);
  });

  it('a promotion takes effect on the next request with the same token', async () => {
    const { user, token } = await makeUserWithToken();

    const before = await auth(request(app).get('/api/users'), token);
    expect(before.status).toBe(403);

    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });

    const after = await auth(request(app).get('/api/users'), token);
    expect(after.status).toBe(200);

    // ...and a demotion closes the door again, same token.
    await User.updateOne({ _id: user._id }, { $set: { role: 'user' } });
    const demoted = await auth(request(app).get('/api/users'), token);
    expect(demoted.status).toBe(403);
  });

  it('rejects a token whose user no longer exists with 403', async () => {
    const { user, token } = await makeUserWithToken({ role: 'admin' });
    await User.deleteOne({ _id: user._id });

    const res = await auth(request(app).get('/api/users'), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('admin gate — the other cross-user routes', () => {
  it('POST /api/users is admin-only', async () => {
    const plain = await makeUserWithToken();
    const denied = await auth(request(app).post('/api/users'), plain.token)
      .send({ username: 'nope', email: 'nope@example.com', password: 'secret123' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(await User.countDocuments({ username: 'nope' })).toBe(0);

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).post('/api/users'), admin.token)
      .send({ username: 'created_by_admin', email: 'cba@example.com', password: 'secret123' });
    expect(allowed.status).toBe(201);
  });

  it('DELETE /api/users/:id is admin-only — a plain user cannot delete anyone', async () => {
    const plain = await makeUserWithToken();
    const victim = await makeUserWithToken();

    const denied = await auth(request(app).delete(`/api/users/${victim.user._id}`), plain.token);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(await User.findById(victim.user._id)).not.toBeNull();

    // Not even themselves — deletion is an administrative act here.
    const self = await auth(request(app).delete(`/api/users/${plain.user._id}`), plain.token);
    expect(self.status).toBe(403);

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).delete(`/api/users/${victim.user._id}`), admin.token);
    expect(allowed.status).toBe(200);
    expect(await User.findById(victim.user._id)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('self routes stay open to any authenticated user', () => {
  const selfRoutes = [
    ['get', '/api/users/me'],
    ['get', '/api/users/bootstrap'],
    ['get', '/api/users/profile'],
    ['get', '/api/users/preferences'],
    ['get', '/api/users/preferences/apps'],
    ['get', '/api/users/preferences/notegeek'],
  ];

  it.each(selfRoutes)('%s %s is not admin-gated', async (method, path) => {
    const { token } = await makeUserWithToken();
    const res = await auth(request(app)[method](path), token);
    expect(res.status).toBe(200);
  });

  it('GET /api/users/me reports the role so frontends can gate UI', async () => {
    const plain = await makeUserWithToken();
    const plainMe = await auth(request(app).get('/api/users/me'), plain.token);
    expect(plainMe.status).toBe(200);
    expect(plainMe.body.user.role).toBe('user');

    const admin = await makeUserWithToken({ role: 'admin' });
    const adminMe = await auth(request(app).get('/api/users/me'), admin.token);
    expect(adminMe.body.user.role).toBe('admin');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('scripts/setUserRole.js — setUserRole()', () => {
  it('promotes an existing user and reports before/after', async () => {
    const { user } = await makeUserWithToken();

    const result = await setUserRole(user.username, 'admin');
    expect(result).toEqual({
      username: user.username,
      before: 'user',
      after: 'admin',
      changed: true,
    });

    const reloaded = await User.findById(user._id).lean();
    expect(reloaded.role).toBe('admin');
  });

  it('demotes an admin back to user', async () => {
    const { user } = await makeUserWithToken({ role: 'admin' });

    const result = await setUserRole(user.username, 'user');
    expect(result).toMatchObject({ before: 'admin', after: 'user', changed: true });
    expect((await User.findById(user._id).lean()).role).toBe('user');
  });

  it('is a reported no-op when the role is already set', async () => {
    const { user } = await makeUserWithToken({ role: 'admin' });

    const result = await setUserRole(user.username, 'admin');
    expect(result).toEqual({
      username: user.username,
      before: 'admin',
      after: 'admin',
      changed: false,
    });
  });

  it('refuses an unknown username and creates nothing', async () => {
    await expect(setUserRole('no_such_user_ever', 'admin'))
      .rejects.toThrow(/No user found/);
    expect(await User.countDocuments({ username: 'no_such_user_ever' })).toBe(0);
  });

  it('refuses a role outside the enum, and a missing username', async () => {
    const { user } = await makeUserWithToken();
    await expect(setUserRole(user.username, 'superuser')).rejects.toThrow(/Invalid role/);
    await expect(setUserRole('', 'admin')).rejects.toThrow(/username is required/);
    expect((await User.findById(user._id).lean()).role).toBe('user');
  });

  it('exports the schema enum it validates against', () => {
    expect(VALID_ROLES).toEqual(['user', 'admin']);
  });
});
