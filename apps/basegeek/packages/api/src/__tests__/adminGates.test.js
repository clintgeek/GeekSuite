/**
 * adminGates.test.js — the admin gates added 2026-09-03.
 *
 * Two surfaces, one rule (`requireAdmin`), two different shapes:
 *
 *   1. The app registry (`routes/apps.js`) is split: reads stay public (it
 *      holds nothing but the public app directory, which the public health
 *      proxy already resolves out of the same collection) while every mutation
 *      (POST / PUT / DELETE / seed) is admin-only. Before this, the whole
 *      router took no credentials at all. The public cases below are the
 *      regression guard on that split — gating the reads would be a visible
 *      failure here, not a silent change.
 *
 *   2. The infrastructure browsers (`/api/mongo`, `/api/redis`,
 *      `/api/postgres`, `/api/influx`) are admin-only end to end. They used to
 *      accept any authenticated caller, and under SSO that means any logged-in
 *      user of any suite app.
 *
 * The gate is asserted from both sides on purpose: a 403 for a plain user is
 * only half the test, because a middleware that rejects everyone would pass
 * it. So every case also proves an admin still gets through, and that a denied
 * mutation left the database untouched.
 *
 * Mongo is the in-memory instance from globalSetup. The App model rides the
 * default mongoose connection and `User` rides `userGeekConn`; setEnv.js
 * points both at this run's mongod, so `/api/mongo/status` really does connect
 * and answer 200 for an admin.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

// node-redis is stubbed: the real client retries a missing server forever, so
// an un-mocked `/api/redis/status` hangs the admin-side case rather than
// failing it. Only `connect`/`info`/`quit`/`isOpen` are exercised by the
// route. Mongo, Postgres and Influx are left alone — whatever is (or isn't)
// listening locally, their handlers answer, which is all those cases assert.
const fakeRedisInfo = [
  '# Server',
  'redis_version:7.2.4',
  'uptime_in_seconds:42',
  'connected_clients:1',
  'used_memory_human:1.00M',
  'db0:keys=3,expires=0,avg_ttl=0',
].join('\n');

jest.unstable_mockModule('redis', () => ({
  createClient: () => ({
    isOpen: true,
    on() {},
    async connect() {},
    async quit() {},
    async info() { return fakeRedisInfo; },
  }),
}));

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: App } = await import('../models/App.js');
const { default: appsRoutes } = await import('../routes/apps.js');
const { default: mongoRoutes } = await import('../routes/mongo.js');
const { default: redisRoutes } = await import('../routes/redis.js');
const { default: postgresRoutes } = await import('../routes/postgres.js');
const { default: influxRoutes } = await import('../routes/influx.js');

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
  app.use('/api/apps', appsRoutes);
  app.use('/api/mongo', mongoRoutes);
  app.use('/api/redis', redisRoutes);
  app.use('/api/postgres', postgresRoutes);
  app.use('/api/influx', influxRoutes);
  return app;
}

let app;
let seq = 0;

/** Create a real User (optionally an admin) and return { user, token }. */
async function makeUserWithToken(overrides = {}) {
  const user = await User.create({
    username: `gate_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, token };
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

const sampleApp = (name) => ({
  name,
  displayName: name,
  url: `https://${name}.example.com`,
});

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
  await App.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('app registry — reads stay public', () => {
  it('GET /api/apps is 200 with no credentials at all', async () => {
    await App.create(sampleApp('publicgeek'));

    const res = await request(app).get('/api/apps');
    expect(res.status).toBe(200);
    expect(res.body.apps.map(a => a.name)).toEqual(['publicgeek']);
  });

  it('GET /api/apps?all=true is 200 unauthenticated, and honours the flag', async () => {
    await App.create({ ...sampleApp('offgeek'), enabled: false });

    const enabledOnly = await request(app).get('/api/apps');
    expect(enabledOnly.status).toBe(200);
    expect(enabledOnly.body.apps).toHaveLength(0);

    const all = await request(app).get('/api/apps?all=true');
    expect(all.status).toBe(200);
    expect(all.body.apps).toHaveLength(1);
  });

  it('GET /api/apps/:name is 200 unauthenticated, 404 for an unknown app', async () => {
    await App.create(sampleApp('onegeek'));

    const found = await request(app).get('/api/apps/onegeek');
    expect(found.status).toBe(200);
    expect(found.body.app.name).toBe('onegeek');

    const missing = await request(app).get('/api/apps/nosuchgeek');
    expect(missing.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('app registry — mutations are admin-only', () => {
  it('POST /api/apps: 401 unauthenticated, 403 for a plain user, 201 for an admin', async () => {
    const anon = await request(app).post('/api/apps').send(sampleApp('anongeek'));
    expect(anon.status).toBe(401);
    expect(await App.countDocuments({ name: 'anongeek' })).toBe(0);

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).post('/api/apps'), plain.token)
      .send(sampleApp('plaingeek'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(await App.countDocuments({ name: 'plaingeek' })).toBe(0);

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).post('/api/apps'), admin.token)
      .send(sampleApp('admingeek'));
    expect(allowed.status).toBe(201);
    expect(allowed.body.app.name).toBe('admingeek');
    expect(await App.countDocuments({ name: 'admingeek' })).toBe(1);
  });

  it('PUT /api/apps/:name: a plain user cannot rewrite a registry entry', async () => {
    await App.create(sampleApp('putgeek'));

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).put('/api/apps/putgeek'), plain.token)
      .send({ url: 'https://evil.example.com' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect((await App.findOne({ name: 'putgeek' })).url).toBe('https://putgeek.example.com');

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).put('/api/apps/putgeek'), admin.token)
      .send({ url: 'https://moved.example.com' });
    expect(allowed.status).toBe(200);
    expect((await App.findOne({ name: 'putgeek' })).url).toBe('https://moved.example.com');
  });

  it('DELETE /api/apps/:name: a plain user cannot remove an app', async () => {
    await App.create(sampleApp('delgeek'));

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).delete('/api/apps/delgeek'), plain.token);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(await App.findOne({ name: 'delgeek' })).not.toBeNull();

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).delete('/api/apps/delgeek'), admin.token);
    expect(allowed.status).toBe(200);
    expect(await App.findOne({ name: 'delgeek' })).toBeNull();
  });

  it('POST /api/apps/seed: 401 unauthenticated, 403 for a plain user, 200 for an admin', async () => {
    const anon = await request(app).post('/api/apps/seed');
    expect(anon.status).toBe(401);
    expect(await App.countDocuments({})).toBe(0);

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).post('/api/apps/seed'), plain.token);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(await App.countDocuments({})).toBe(0);

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).post('/api/apps/seed'), admin.token);
    expect(allowed.status).toBe(200);
    expect(await App.countDocuments({})).toBeGreaterThan(0);
    // Idempotent, and still admin-only on the second call.
    const again = await auth(request(app).post('/api/apps/seed'), admin.token);
    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/0 created/);
  });

  it('a promotion opens the registry on the next request with the same token', async () => {
    const { user, token } = await makeUserWithToken();

    const before = await auth(request(app).post('/api/apps'), token).send(sampleApp('promogeek'));
    expect(before.status).toBe(403);

    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });

    const after = await auth(request(app).post('/api/apps'), token).send(sampleApp('promogeek'));
    expect(after.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('infrastructure browsers — admin-only routers', () => {
  const browsers = [
    ['/api/mongo/status'],
    ['/api/redis/status'],
    ['/api/postgres/status'],
    ['/api/influx/status'],
  ];

  it.each(browsers)('GET %s is 401 with no token', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it.each(browsers)("GET %s is 403 { error: 'admin_required' } for a plain user", async (path) => {
    const { token } = await makeUserWithToken();
    const res = await auth(request(app).get(path), token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
    // The gate must run before the handler: no infrastructure detail leaks.
    expect(res.body.databases).toBeUndefined();
    expect(res.body.statsRaw).toBeUndefined();
    expect(res.body.config).toBeUndefined();
  });

  it('GET /api/mongo/status reaches the handler for an admin', async () => {
    const admin = await makeUserWithToken({ role: 'admin' });
    const res = await auth(request(app).get('/api/mongo/status'), admin.token);

    // The in-memory mongod is real and reachable, so this is a genuine 200
    // with the cluster inventory the gate exists to protect.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
    expect(Array.isArray(res.body.databases)).toBe(true);
  });

  it('GET /api/redis/status reaches the handler for an admin', async () => {
    const admin = await makeUserWithToken({ role: 'admin' });
    const res = await auth(request(app).get('/api/redis/status'), admin.token);

    expect(res.status).toBe(200);
    expect(res.body.redisVersion).toBe('7.2.4');
    // The raw INFO dump is exactly the sort of thing a plain user must not see.
    expect(res.body.statsRaw).toBeDefined();
  });

  it.each([
    ['/api/postgres/status'],
    ['/api/influx/status'],
  ])('GET %s reaches the handler for an admin', async (path) => {
    const admin = await makeUserWithToken({ role: 'admin' });
    const res = await auth(request(app).get(path), admin.token);

    // Whether a Postgres/Influx server is listening is environment-dependent:
    // reachable gives 200, absent gives 500 (postgres) or 200 with
    // status 'unreachable' (influx). The assertion is deliberately about the
    // gate, not the backend — the request got past it, so this is not the 403
    // a plain user gets and not the role-check error body.
    expect([200, 500]).toContain(res.status);
    expect(res.body.error).not.toBe('admin_required');
  }, 20000);

  it('a demotion closes the browsers again, same token', async () => {
    const { user, token } = await makeUserWithToken({ role: 'admin' });

    const asAdmin = await auth(request(app).get('/api/mongo/status'), token);
    expect(asAdmin.status).toBe(200);

    await User.updateOne({ _id: user._id }, { $set: { role: 'user' } });

    const demoted = await auth(request(app).get('/api/mongo/status'), token);
    expect(demoted.status).toBe(403);
    expect(demoted.body.error).toBe('admin_required');
  });
});
