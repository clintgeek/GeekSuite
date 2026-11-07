/**
 * authHardeningKeys.test.js — the `bg_` key lifecycle, held to one policy on
 * both transports. (Audit 2026-11-06, findings B1 and B2.)
 *
 * B1. Q62 (2026-09-06) gated `POST /api/api-keys` and its regenerate route:
 *     admin, or the caller already holds an active key for an app in
 *     VALID_APPS. The GraphQL twins — `createAPIKey`, `regenerateAPIKey` —
 *     were never told. They checked only that *someone* was logged in, so the
 *     REST gate was a locked front door beside an open side door: any user
 *     could mint `appName: 'storygeek'` over /graphql and be storygeek as far
 *     as aiGeek routing and billing are concerned.
 *
 * B2. Even through the gate, a key holder could escalate. Holding one key for
 *     an app let you mint another with *any* permission — `ai:director`
 *     included — and `PUT /api/api-keys/:id` / `updateAPIKey` let the creator
 *     of a key rewrite its permissions, raise its rate limits to the schema
 *     ceiling, and delete its expiry. The policy now: an admin is
 *     unrestricted; anyone else may only narrow. A non-admin mint starts from
 *     the default key (DEFAULT_KEY_PERMISSIONS, default limits — no
 *     `ai:director`) and may go down from there, never up; a non-admin update
 *     may only go down from what the key already has.
 *
 * Every refusal is asserted from both sides — refused for the plain user, and
 * the same request allowed for an admin, or a narrower one allowed for the
 * plain user — because a gate that refuses everyone passes half these tests.
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
const { default: APIKey, DEFAULT_KEY_PERMISSIONS } = await import('../models/APIKey.js');
const { default: apiKeyRoutes } = await import('../routes/apiKeys.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');

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
  app.use('/api/api-keys', apiKeyRoutes);
  return app;
}

let app;
let seq = 0;

async function makeUser({ role = undefined } = {}) {
  const user = await User.create({
    username: `harden_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...(role ? { role } : {}),
  });
  const id = user._id.toString();
  const token = jwt.sign({ id, app: 'basegeek' }, process.env.JWT_SECRET);
  // The GraphQL context user, shaped the way localSessionValidator returns it.
  return { user, id, token, ctx: { user: { id } } };
}

async function seedKey(ownerId, appName, extra = {}) {
  const { keyPrefix, keyHash } = APIKey.generateAPIKey();
  return APIKey.create({
    keyHash,
    keyPrefix,
    name: `seeded ${appName} key ${seq++}`,
    appName,
    createdBy: ownerId,
    ...extra,
  });
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const future = (days) => new Date(Date.now() + days * 86400000);

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
  await APIKey.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────── B1: GraphQL mint gate ───────────────────────────

describe('B1 — GraphQL createAPIKey / regenerateAPIKey honour the REST mint gate', () => {
  it('createAPIKey refuses a plain user minting for an app they do not hold', async () => {
    const plain = await makeUser();

    await expect(
      resolvers.Mutation.createAPIKey(null, { name: 'sneaky', appName: 'storygeek' }, plain.ctx)
    ).rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED', error: 'admin_required' } });
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(0);
  });

  it('createAPIKey refuses a holder of some *other* app\'s key', async () => {
    const plain = await makeUser();
    await seedKey(plain.id, 'notegeek');

    await expect(
      resolvers.Mutation.createAPIKey(null, { name: 'sneaky', appName: 'storygeek' }, plain.ctx)
    ).rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED' } });
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(0);
  });

  it('createAPIKey lets a holder mint another for the same app, and an admin mint anything', async () => {
    const holder = await makeUser();
    await seedKey(holder.id, 'storygeek');
    const admin = await makeUser({ role: 'admin' });

    const mine = await resolvers.Mutation.createAPIKey(null, { name: 'second', appName: 'storygeek' }, holder.ctx);
    const novel = await resolvers.Mutation.createAPIKey(null, { name: 'first', appName: 'brandnewgeek' }, admin.ctx);

    expect(mine.keyInfo.appName).toBe('storygeek');
    expect(mine.keyInfo.permissions).toEqual(DEFAULT_KEY_PERMISSIONS);
    expect(novel.keyInfo.appName).toBe('brandnewgeek');
  });

  it('regenerateAPIKey leaves a key for an unregistered app to an admin, and does not half-rotate', async () => {
    const plain = await makeUser();
    const key = await seedKey(plain.id, 'notanapp');

    await expect(
      resolvers.Mutation.regenerateAPIKey(null, { id: key.keyId }, plain.ctx)
    ).rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED' } });

    const stored = await APIKey.findOne({ keyId: key.keyId }).lean();
    expect(stored.keyHash).toBe(key.keyHash);
    expect(stored.keyPrefix).toBe(key.keyPrefix);
  });

  it('regenerateAPIKey still rotates a holder\'s key for a registered app', async () => {
    const holder = await makeUser();
    const key = await seedKey(holder.id, 'storygeek');

    const out = await resolvers.Mutation.regenerateAPIKey(null, { id: key.keyId }, holder.ctx);
    expect(out.keyInfo.keyPrefix).not.toBe(key.keyPrefix);
  });
});

// ─────────────────────────── B2: mint escalation ─────────────────────────────

describe('B2 — a non-admin mint starts from the default key and may only narrow', () => {
  it('REST refuses a holder minting ai:director, and creates nothing', async () => {
    const holder = await makeUser();
    await seedKey(holder.id, 'storygeek');

    const res = await auth(request(app).post('/api/api-keys'), holder.token)
      .send({ name: 'director', appName: 'storygeek', permissions: ['ai:call', 'ai:director'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESCALATION_REFUSED');
    expect(res.body.fields).toEqual(['permissions']);
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(1);
  });

  it('REST refuses a holder minting above the default rate limits', async () => {
    const holder = await makeUser();
    await seedKey(holder.id, 'storygeek');

    const res = await auth(request(app).post('/api/api-keys'), holder.token)
      .send({ name: 'fast', appName: 'storygeek', rateLimit: { requestsPerMinute: 1000 } });

    expect(res.status).toBe(403);
    expect(res.body.fields).toEqual(['rateLimit.requestsPerMinute']);
  });

  it('REST lets a holder mint a narrower key', async () => {
    const holder = await makeUser();
    await seedKey(holder.id, 'storygeek');

    const res = await auth(request(app).post('/api/api-keys'), holder.token)
      .send({ name: 'narrow', appName: 'storygeek', permissions: ['ai:call'], rateLimit: { requestsPerMinute: 10 } });

    expect(res.status).toBe(201);
    expect(res.body.data.keyInfo.permissions).toEqual(['ai:call']);
    expect(res.body.data.keyInfo.rateLimit.requestsPerMinute).toBe(10);
  });

  it('REST lets an admin mint ai:director at the schema ceiling', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await auth(request(app).post('/api/api-keys'), admin.token)
      .send({ name: 'director', appName: 'storygeek', permissions: ['ai:call', 'ai:director'], rateLimit: { requestsPerMinute: 1000 } });

    expect(res.status).toBe(201);
    expect(res.body.data.keyInfo.permissions).toContain('ai:director');
  });

  it('GraphQL refuses the same director mint for a holder, allows it for an admin', async () => {
    const holder = await makeUser();
    await seedKey(holder.id, 'storygeek');
    const admin = await makeUser({ role: 'admin' });
    const args = { name: 'director', appName: 'storygeek', permissions: ['ai:call', 'ai:director'] };

    await expect(resolvers.Mutation.createAPIKey(null, args, holder.ctx))
      .rejects.toMatchObject({ extensions: { code: 'ESCALATION_REFUSED', error: 'escalation_refused', fields: ['permissions'] } });
    const ok = await resolvers.Mutation.createAPIKey(null, args, admin.ctx);
    expect(ok.keyInfo.permissions).toContain('ai:director');
  });
});

// ─────────────────────────── B2: update escalation ───────────────────────────

describe('B2 — a non-admin update may only narrow the key it holds', () => {
  const narrowKey = (ownerId) => seedKey(ownerId, 'storygeek', {
    permissions: ['ai:call'],
    rateLimit: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
    expiresAt: future(30),
  });

  it('REST refuses adding a permission, and leaves the key as it was', async () => {
    const holder = await makeUser();
    const key = await narrowKey(holder.id);

    const res = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({ permissions: ['ai:call', 'ai:director'] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESCALATION_REFUSED');
    const stored = await APIKey.findOne({ keyId: key.keyId }).lean();
    expect(stored.permissions).toEqual(['ai:call']);
  });

  it('REST refuses raising a rate limit', async () => {
    const holder = await makeUser();
    const key = await narrowKey(holder.id);

    const res = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({ rateLimit: { requestsPerDay: 100000 } });

    expect(res.status).toBe(403);
    expect(res.body.fields).toEqual(['rateLimit.requestsPerDay']);
  });

  it('REST refuses removing or extending an expiry', async () => {
    const holder = await makeUser();
    const key = await narrowKey(holder.id);

    const removed = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({ expiresAt: null });
    const extended = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({ expiresAt: future(365).toISOString() });

    expect(removed.status).toBe(403);
    expect(extended.status).toBe(403);
    expect(removed.body.fields).toEqual(['expiresAt']);
    const stored = await APIKey.findOne({ keyId: key.keyId }).lean();
    expect(stored.expiresAt.getTime()).toBe(key.expiresAt.getTime());
  });

  it('REST allows narrowing, and a resubmission of the same values (what the edit dialog sends)', async () => {
    const holder = await makeUser();
    const key = await narrowKey(holder.id);

    const same = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({
        name: 'renamed',
        permissions: ['ai:call'],
        rateLimit: { requestsPerMinute: 10, requestsPerHour: 100, requestsPerDay: 1000 },
        expiresAt: key.expiresAt.toISOString(),
      });
    const narrower = await auth(request(app).put(`/api/api-keys/${key.keyId}`), holder.token)
      .send({ permissions: [], rateLimit: { requestsPerMinute: 5 }, expiresAt: future(7).toISOString() });

    expect(same.status).toBe(200);
    expect(same.body.data.name).toBe('renamed');
    expect(narrower.status).toBe(200);
    expect(narrower.body.data.permissions).toEqual([]);
    expect(narrower.body.data.rateLimit.requestsPerMinute).toBe(5);
  });

  it('REST lets an admin widen their own key', async () => {
    const admin = await makeUser({ role: 'admin' });
    const key = await narrowKey(admin.id);

    const res = await auth(request(app).put(`/api/api-keys/${key.keyId}`), admin.token)
      .send({ permissions: ['ai:call', 'ai:director'], rateLimit: { requestsPerDay: 100000 }, expiresAt: null });

    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toContain('ai:director');
    expect(res.body.data.expiresAt).toBeNull();
  });

  it('GraphQL updateAPIKey refuses the same escalations for a holder', async () => {
    const holder = await makeUser();
    const key = await narrowKey(holder.id);

    await expect(resolvers.Mutation.updateAPIKey(null, { id: key.keyId, permissions: ['ai:call', 'ai:director'] }, holder.ctx))
      .rejects.toMatchObject({ extensions: { code: 'ESCALATION_REFUSED', fields: ['permissions'] } });
    await expect(resolvers.Mutation.updateAPIKey(null, { id: key.keyId, rateLimit: { requestsPerMinute: 1000 } }, holder.ctx))
      .rejects.toMatchObject({ extensions: { code: 'ESCALATION_REFUSED' } });
    await expect(resolvers.Mutation.updateAPIKey(null, { id: key.keyId, expiresAt: null }, holder.ctx))
      .rejects.toMatchObject({ extensions: { code: 'ESCALATION_REFUSED', fields: ['expiresAt'] } });

    const stored = await APIKey.findOne({ keyId: key.keyId }).lean();
    expect(stored.permissions).toEqual(['ai:call']);
    expect(stored.rateLimit.requestsPerMinute).toBe(10);
    expect(stored.expiresAt).not.toBeNull();
  });

  it('GraphQL updateAPIKey allows a holder to narrow, and an admin to widen', async () => {
    const holder = await makeUser();
    const hk = await narrowKey(holder.id);
    const admin = await makeUser({ role: 'admin' });
    const ak = await narrowKey(admin.id);

    const narrowed = await resolvers.Mutation.updateAPIKey(null, { id: hk.keyId, permissions: [], isActive: true }, holder.ctx);
    const widened = await resolvers.Mutation.updateAPIKey(null, { id: ak.keyId, permissions: ['ai:director'], expiresAt: null }, admin.ctx);

    expect(narrowed.permissions).toEqual([]);
    expect(widened.permissions).toEqual(['ai:director']);
    expect(widened.expiresAt).toBeNull();
  });
});
