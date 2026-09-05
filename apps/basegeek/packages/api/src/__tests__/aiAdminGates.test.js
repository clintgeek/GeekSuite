/**
 * aiAdminGates.test.js — the admin gate and the key mask on aiGeek.
 *
 * Before this, every provider credential in the suite was readable and
 * rewritable by any authenticated user: `/api/ai/config` decrypted the keys and
 * handed them to the browser, and under SSO "authenticated" means any logged-in
 * user of any of the eight apps. Two changes close that, and both are asserted
 * here from both sides — a 403 for a plain user proves nothing on its own,
 * because a gate that rejects everyone would also pass it.
 *
 *   1. **The gate.** `GET/POST /api/ai/config` and `POST /api/ai/test` take
 *      `requireAdminUser`, which reuses the shared `requireRole('admin')` and
 *      so emits the same `{ error: 'admin_required' }` body every other admin
 *      gate in the suite does (see adminGates.test.js). API keys are refused
 *      before the role lookup: a key belongs to an app, not a person.
 *      GraphQL gets the same rule via `requireAdminUser(user)` in the
 *      resolvers, thrown as ADMIN_REQUIRED.
 *
 *   2. **The mask.** Neither transport returns a decrypted key any more —
 *      `{ hasKey, keyHint, enabled }` per provider and nothing else. Which
 *      makes a blank key on save mean "keep the stored one", since the client
 *      no longer has it to echo back. The save path is asserted to preserve
 *      the stored ciphertext while still writing `enabled`, because the old
 *      code skipped the whole entry when no key came with it.
 *
 * Roles are read from the userGeek document per request, so a promotion lands
 * without a re-login; that is asserted too.
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
const { default: AIConfig } = await import('../models/AIConfig.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');
const { encrypt } = await import('../lib/cryptoVault.js');

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
  app.use('/api/ai', aiRoutes);
  return app;
}

let app;
let seq = 0;

/** Create a real User (optionally an admin) and return { user, token }. */
async function makeUserWithToken(overrides = {}) {
  const user = await User.create({
    username: `ai_gate_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, token };
}

/** A real, active API key whose raw value authenticates against the router. */
async function makeApiKey() {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash,
    keyPrefix,
    name: 'gate probe',
    appName: 'testgeek',
    permissions: ['ai:call', 'ai:stats'],
    createdBy: new mongoose.Types.ObjectId(),
  });
  return apiKey;
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

/** A stored, encrypted provider key — what the mask has to hide. */
const SECRET_KEY = 'sk-ant-supersecret-value-abcd';

async function storeAnthropicKey({ enabled = true } = {}) {
  await AIConfig.findOneAndUpdate(
    { provider: 'anthropic' },
    { apiKey: encrypt(SECRET_KEY), enabled },
    { upsert: true, new: true }
  );
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
  await AIConfig.deleteMany({});
  await APIKey.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REST — provider config is admin-only', () => {
  it('GET /api/ai/config: 401 anonymous, 403 for a plain user, 200 for an admin', async () => {
    await storeAnthropicKey();

    const anon = await request(app).get('/api/ai/config');
    expect(anon.status).toBe(401);

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).get('/api/ai/config'), plain.token);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    // The gate must run before the handler: nothing about the key leaks.
    expect(JSON.stringify(denied.body)).not.toContain('anthropic');

    const admin = await makeUserWithToken({ role: 'admin' });
    const allowed = await auth(request(app).get('/api/ai/config'), admin.token);
    expect(allowed.status).toBe(200);
    expect(allowed.body.anthropic).toBeDefined();
  });

  it('an API key is refused even with ai:stats — keys belong to apps, not admins', async () => {
    const rawKey = await makeApiKey();
    const res = await auth(request(app).get('/api/ai/config'), rawKey);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
  });

  it('POST /api/ai/test is gated before it reads the body', async () => {
    const plain = await makeUserWithToken();
    // No provider in the body: an ungated handler would answer 400
    // MISSING_PROVIDER, so a 403 proves the gate ran first.
    const denied = await auth(request(app).post('/api/ai/test'), plain.token).send({});
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');
    expect(denied.body.error?.code).not.toBe('MISSING_PROVIDER');
  });

  it('POST /api/ai/config: a plain user cannot rewrite a provider key', async () => {
    await storeAnthropicKey();
    const before = await AIConfig.findOne({ provider: 'anthropic' });

    const plain = await makeUserWithToken();
    const denied = await auth(request(app).post('/api/ai/config'), plain.token)
      .send({ anthropic: { apiKey: 'sk-ant-attacker', enabled: true } });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('admin_required');

    const after = await AIConfig.findOne({ provider: 'anthropic' });
    expect(after.apiKey).toBe(before.apiKey);
    expect(after.getDecryptedKey()).toBe(SECRET_KEY);
  });

  it('a promotion opens the config on the next request with the same token', async () => {
    await storeAnthropicKey();
    const { user, token } = await makeUserWithToken();

    expect((await auth(request(app).get('/api/ai/config'), token)).status).toBe(403);

    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });

    expect((await auth(request(app).get('/api/ai/config'), token)).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REST — the config response is masked', () => {
  it('returns { hasKey, keyHint, enabled } and never the credential', async () => {
    await storeAnthropicKey({ enabled: true });
    const admin = await makeUserWithToken({ role: 'admin' });

    const res = await auth(request(app).get('/api/ai/config'), admin.token);
    expect(res.status).toBe(200);

    expect(res.body.anthropic).toEqual({
      hasKey: true,
      keyHint: '…abcd',
      enabled: true,
    });

    // Not the key, not a fragment of it, not an apiKey field anywhere.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SECRET_KEY);
    expect(body).not.toContain('supersecret');
    expect(body).not.toContain('apiKey');
  });

  it('reports an unconfigured provider as hasKey false with an empty hint', async () => {
    const admin = await makeUserWithToken({ role: 'admin' });
    const res = await auth(request(app).get('/api/ai/config'), admin.token);

    expect(res.body.groq).toEqual({ hasKey: false, keyHint: '', enabled: false });
    // cloudflare carries its account id alongside the mask.
    expect(res.body.cloudflare).toEqual({
      hasKey: false, keyHint: '', enabled: false, accountId: '',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REST — saving without a key keeps the stored one', () => {
  it('a blank key preserves the credential and still writes enabled', async () => {
    await storeAnthropicKey({ enabled: true });
    const stored = (await AIConfig.findOne({ provider: 'anthropic' })).apiKey;
    const admin = await makeUserWithToken({ role: 'admin' });

    // Exactly what the page now sends for an untouched key field.
    const res = await auth(request(app).post('/api/ai/config'), admin.token)
      .send({ anthropic: { enabled: false } });
    expect(res.status).toBe(200);

    const after = await AIConfig.findOne({ provider: 'anthropic' });
    expect(after.apiKey).toBe(stored);
    expect(after.getDecryptedKey()).toBe(SECRET_KEY);
    // The toggle landed — the old shape dropped it whenever no key came along.
    expect(after.enabled).toBe(false);
  });

  it('a supplied key replaces the stored one, encrypted', async () => {
    await storeAnthropicKey();
    const admin = await makeUserWithToken({ role: 'admin' });

    const res = await auth(request(app).post('/api/ai/config'), admin.token)
      .send({ anthropic: { apiKey: 'sk-ant-rotated-wxyz', enabled: true } });
    expect(res.status).toBe(200);

    const after = await AIConfig.findOne({ provider: 'anthropic' });
    expect(after.getDecryptedKey()).toBe('sk-ant-rotated-wxyz');
    expect(after.apiKey).not.toContain('sk-ant-rotated-wxyz');
  });

  it('never creates a keyless document for a provider that has none', async () => {
    const admin = await makeUserWithToken({ role: 'admin' });

    const res = await auth(request(app).post('/api/ai/config'), admin.token)
      .send({ groq: { enabled: true } });
    expect(res.status).toBe(200);
    expect(await AIConfig.countDocuments({ provider: 'groq' })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GraphQL — the same rule, the same shape', () => {
  const ctxFor = (user) => user;

  it('aiConfig throws ADMIN_REQUIRED for a plain user', async () => {
    await storeAnthropicKey();
    const { user } = await makeUserWithToken();

    await expect(resolvers.Query.aiConfig(null, null, { user: ctxFor({ id: user._id.toString() }) }))
      .rejects.toMatchObject({
        message: 'admin role required',
        extensions: { code: 'ADMIN_REQUIRED', error: 'admin_required' },
      });
  });

  it('aiConfig is UNAUTHENTICATED with no user at all', async () => {
    await expect(resolvers.Query.aiConfig(null, null, { user: null }))
      .rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('aiConfig refuses an API key context before it looks up a role', async () => {
    await expect(resolvers.Query.aiConfig(null, null, {
      user: { id: 'apikey_abc', app: 'testgeek', type: 'api_key' },
    })).rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED' } });
  });

  it('aiConfig returns the same mask for an admin', async () => {
    await storeAnthropicKey({ enabled: true });
    const { user } = await makeUserWithToken({ role: 'admin' });

    const config = await resolvers.Query.aiConfig(null, null, {
      user: { id: user._id.toString() },
    });

    expect(config.anthropic).toEqual({ hasKey: true, keyHint: '…abcd', enabled: true });
    expect(JSON.stringify(config)).not.toContain(SECRET_KEY);
  });

  it('reads that are not credentials stay open to any authenticated user', async () => {
    const { user } = await makeUserWithToken();
    const stats = await resolvers.Query.aiStats(null, null, { user: { id: user._id.toString() } });
    expect(stats).toBeDefined();
  });

  it('the privileged mutations are all gated', async () => {
    const { user } = await makeUserWithToken();
    const ctx = { user: { id: user._id.toString() } };

    const calls = [
      () => resolvers.Mutation.saveAIConfig(null, { config: {} }, ctx),
      () => resolvers.Mutation.testAIProvider(null, { provider: 'anthropic' }, ctx),
      () => resolvers.Mutation.resetAIStats(null, null, ctx),
      () => resolvers.Mutation.seedDirectorPricing(null, null, ctx),
      () => resolvers.Mutation.seedDirectorFreeTier(null, null, ctx),
      () => resolvers.Mutation.syncProviderModels(null, { provider: 'anthropic' }, ctx),
      () => resolvers.Mutation.updateModelPricing(null, { provider: 'anthropic', modelId: 'm', inputPrice: 1, outputPrice: 1 }, ctx),
      () => resolvers.Mutation.deleteModelPricing(null, { provider: 'anthropic', modelId: 'm' }, ctx),
      () => resolvers.Mutation.updateModelFreeTier(null, { provider: 'anthropic', modelId: 'm', isFree: true }, ctx),
      () => resolvers.Mutation.deleteModelFreeTier(null, { provider: 'anthropic', modelId: 'm' }, ctx),
      () => resolvers.Mutation.resetAllFreeTiers(null, null, ctx),
      () => resolvers.Mutation.bulkUpdateFreeTiers(null, { updates: [] }, ctx),
      () => resolvers.Mutation.saveAIAppConfig(null, { appName: 'x', config: {} }, ctx),
      () => resolvers.Mutation.deleteAIAppConfig(null, { appName: 'x' }, ctx),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        extensions: { code: 'ADMIN_REQUIRED' },
      });
    }
  });

  it('saveAIConfig keeps the stored key when none is supplied', async () => {
    await storeAnthropicKey({ enabled: true });
    const stored = (await AIConfig.findOne({ provider: 'anthropic' })).apiKey;
    const { user } = await makeUserWithToken({ role: 'admin' });

    await resolvers.Mutation.saveAIConfig(
      null,
      { config: { anthropic: { enabled: false } } },
      { user: { id: user._id.toString() } }
    );

    const after = await AIConfig.findOne({ provider: 'anthropic' });
    expect(after.apiKey).toBe(stored);
    expect(after.enabled).toBe(false);
  });
});
