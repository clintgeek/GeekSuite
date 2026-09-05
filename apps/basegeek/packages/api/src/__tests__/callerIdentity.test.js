/**
 * callerIdentity.test.js — aiGeek attributes calls to the credential, not the body.
 *
 * The hole this closes: `/api/ai/call` read `config.appName` out of the
 * request body and used it for two decisions that cost money — which
 * `AIAppConfig` row routes the call (so, which model answers) and which app
 * the usage lands against. Any holder of any key or token could name any app.
 * The fix is a resolver that reads the API key's `appName` or the JWT's `app`
 * claim and ignores what the body says its name is.
 *
 * A body field that no longer decides anything is easy to *think* you removed,
 * so every route test below sends a body that lies — a caller authenticated as
 * one app claiming to be another — and asserts the credential won. A test that
 * only sent an honest body would pass against the old code too.
 *
 * Also asserted here:
 *   - normalization: `fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan`
 *     are one app id plus a feature;
 *   - the routing lookup still finds the legacy rows an admin already pinned;
 *   - the usage breakdown groups by app id with features nested inside, so
 *     "what does fitnessgeek cost" has one answer instead of three.
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
const { default: APIKey } = await import('../models/APIKey.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { default: openaiProxy } = await import('../routes/openaiProxy.js');
const { default: aiService } = await import('../services/aiService.js');
const {
  resolveCaller,
  internalCaller,
  normalizeAppId,
  normalizeFeature,
  featureFromAppName,
  declaresAppRouting,
  UNATTRIBUTED,
} = await import('../services/callerIdentity.js');

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
  app.use('/openai/v1', openaiProxy);
  return app;
}

let app;
let seq = 0;

/** The config aiService was handed on the last call. */
let captured = null;
let originalCallAI;

async function makeUserWithToken({ appClaim = 'basegeek', ...overrides } = {}) {
  const user = await User.create({
    username: `caller_id_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });
  const token = jwt.sign(
    { id: user._id.toString(), ...(appClaim ? { app: appClaim } : {}) },
    process.env.JWT_SECRET
  );
  return { user, token };
}

/**
 * A real, active API key. The raw value is generated per test and never
 * leaves the process — fixtures may mint keys, transcripts may not carry them.
 */
async function makeApiKey({ appName = 'storygeek', permissions = ['ai:call'], owner } = {}) {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  const createdBy = owner || new mongoose.Types.ObjectId().toString();
  await APIKey.create({
    keyHash,
    keyPrefix,
    name: 'caller identity probe',
    appName,
    permissions,
    createdBy,
  });
  return { apiKey, createdBy };
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();

  // Never reach a provider. The routes call aiService.callAI by property
  // lookup on the singleton, so swapping the method here intercepts them all.
  originalCallAI = aiService.callAI;
  aiService.callAI = async (prompt, config) => {
    captured = { prompt, config };
    return 'stubbed answer';
  };
  aiService.initialized = true;
}, 60000);

afterEach(async () => {
  captured = null;
  await User.deleteMany({});
  await APIKey.deleteMany({});
  await AIAppConfig.deleteMany({});
});

afterAll(async () => {
  aiService.callAI = originalCallAI;
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────── pure resolution ──────────────────────────────

describe('normalization', () => {
  it('lowercases and drops the :feature suffix', () => {
    expect(normalizeAppId('fitnessGeek')).toBe('fitnessgeek');
    expect(normalizeAppId('fitnessgeek')).toBe('fitnessgeek');
    expect(normalizeAppId('fitnessGeek:mealPlan')).toBe('fitnessgeek');
    expect(normalizeAppId('  StoryGeek  ')).toBe('storygeek');
  });

  it('has no opinion about non-strings or empties', () => {
    expect(normalizeAppId(null)).toBeNull();
    expect(normalizeAppId(42)).toBeNull();
    expect(normalizeAppId('   ')).toBeNull();
    expect(normalizeAppId(':mealPlan')).toBeNull();
  });

  it('keeps the suffix as a feature', () => {
    expect(featureFromAppName('fitnessGeek:mealPlan')).toBe('mealplan');
    expect(featureFromAppName('fitnessgeek')).toBeNull();
    expect(normalizeFeature('  MealPlan ')).toBe('mealplan');
  });
});

describe('resolveCaller', () => {
  it('takes the app from the API key and ignores the body', () => {
    const req = {
      user: { id: 'apikey_x', app: 'storygeek', type: 'api_key' },
      apiKey: { appName: 'storyGeek', owner: 'owner-id' },
    };
    const caller = resolveCaller(req, { appName: 'fitnessgeek', config: { appName: 'notegeek' } });
    expect(caller).toMatchObject({ appId: 'storygeek', source: 'api_key', verified: true });
  });

  it('lets a key name the user it is calling for, and falls back to its owner', () => {
    const req = {
      user: { id: 'apikey_x', app: 'storygeek', type: 'api_key' },
      apiKey: { appName: 'storygeek', owner: 'owner-id' },
    };
    expect(resolveCaller(req, { userId: 'player-7' }).userId).toBe('player-7');
    expect(resolveCaller(req, {}).userId).toBe('owner-id');
    // A "user id" that isn't one is dropped rather than stored.
    expect(resolveCaller(req, { userId: 'x'.repeat(65) }).userId).toBe('owner-id');
    expect(resolveCaller(req, { userId: { evil: true } }).userId).toBe('owner-id');
  });

  it('takes the app from the JWT app claim and ignores the body', () => {
    const req = { user: { id: 'user-1', app: 'bujogeek' } };
    const caller = resolveCaller(req, { appName: 'storygeek' });
    expect(caller).toMatchObject({
      appId: 'bujogeek', userId: 'user-1', source: 'jwt', verified: true,
    });
  });

  it('marks a JWT with no app claim unverified rather than believing the body', () => {
    const caller = resolveCaller({ user: { id: 'user-1' } }, { appName: 'storygeek' });
    expect(caller).toMatchObject({
      appId: UNATTRIBUTED, userId: 'user-1', source: 'jwt', verified: false,
    });
  });

  it('buckets a credential-less caller as unattributed', () => {
    const caller = resolveCaller({}, { appName: 'storygeek' });
    expect(caller).toMatchObject({
      appId: UNATTRIBUTED, userId: null, source: UNATTRIBUTED, verified: false,
    });
  });

  it('is the one thing the body may still say: the feature', () => {
    const req = { user: { id: 'u', app: 'fitnessgeek' } };
    expect(resolveCaller(req, { feature: 'MealPlan' }).feature).toBe('mealplan');
    expect(resolveCaller(req, { config: { feature: 'coach' } }).feature).toBe('coach');
    // Legacy `app:feature` — the app half is discarded, the feature half kept.
    const legacy = resolveCaller(req, { config: { appName: 'storyGeek:gm' } });
    expect(legacy).toMatchObject({ appId: 'fitnessgeek', feature: 'gm' });
  });

  it('names an in-process caller without a request at all', () => {
    expect(internalCaller({ appId: 'StartGeek', userId: 'u1', feature: 'Plan' }))
      .toEqual({ appId: 'startgeek', feature: 'plan', userId: 'u1', source: 'internal', verified: true });
  });
});

describe('declaresAppRouting', () => {
  it('treats a named app or feature as the routing switch it always was', () => {
    expect(declaresAppRouting({ config: { appName: 'fitnessGeek' } })).toBe(true);
    expect(declaresAppRouting({ appName: 'storygeek' })).toBe(true);
    expect(declaresAppRouting({ feature: 'mealPlan' })).toBe(true);
  });

  it('leaves the AIGeek "Try it" panel testing the raw rotation', () => {
    // It deliberately sends no app — auto-routing it would defeat its purpose.
    expect(declaresAppRouting({ config: { provider: 'groq' } })).toBe(false);
    expect(declaresAppRouting({ config: { appName: 'unknown' } })).toBe(false);
    expect(declaresAppRouting({})).toBe(false);
  });
});

// ────────────────────────────── over the wire ───────────────────────────────

describe('POST /api/ai/call', () => {
  it('attributes to the key\'s app, not the appName in the body', async () => {
    const { apiKey } = await makeApiKey({ appName: 'storygeek' });

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { appName: 'fitnessgeek', provider: 'groq' } });

    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('storygeek');
  });

  it('attributes to the JWT app claim, not the appName in the body', async () => {
    const { user, token } = await makeUserWithToken({ appClaim: 'bujogeek' });

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'hi', config: { appName: 'storygeek', provider: 'groq' } });

    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('bujogeek');
    expect(captured.config.userId).toBe(user._id.toString());
  });

  it('keeps the feature the body names, on the app the credential names', async () => {
    const { apiKey } = await makeApiKey({ appName: 'fitnessgeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', feature: 'mealPlan', config: { provider: 'groq' } });

    expect(captured.config.appName).toBe('fitnessgeek');
    expect(captured.config.feature).toBe('mealplan');
  });

  it('normalizes a mixed-case key app to one id', async () => {
    const { apiKey } = await makeApiKey({ appName: 'fitnessGeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { provider: 'groq' } });

    expect(captured.config.appName).toBe('fitnessgeek');
  });

  it('lets a service key name the player it is calling for', async () => {
    const { apiKey } = await makeApiKey({ appName: 'storygeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', userId: 'player-42', config: { provider: 'groq' } });

    expect(captured.config.userId).toBe('player-42');
  });

  it('still auto-routes a body that names an app and no provider', async () => {
    const { apiKey } = await makeApiKey({ appName: 'fitnessgeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { appName: 'whatever-it-claims' } });

    expect(captured.config.useAppConfig).toBe(true);
    expect(captured.config.appName).toBe('fitnessgeek');
  });

  it('does not auto-route a body that names nothing', async () => {
    const { apiKey } = await makeApiKey({ appName: 'fitnessgeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi' });

    expect(captured.config.useAppConfig).toBeFalsy();
  });
});

describe('POST /api/ai/call-smart', () => {
  it('attributes to the credential rather than body.appName', async () => {
    const { apiKey } = await makeApiKey({ appName: 'storygeek' });

    const originalSmart = aiService.callAISmart;
    let smartOptions = null;
    aiService.callAISmart = async (messages, options) => {
      smartOptions = options;
      return { success: true, content: 'ok' };
    };

    try {
      const res = await request(app)
        .post('/api/ai/call-smart')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ messages: [{ role: 'user', content: 'hi' }], appName: 'notegeek:draft' });

      expect(res.status).toBe(200);
      expect(smartOptions.appName).toBe('storygeek');
      expect(smartOptions.feature).toBe('draft');
    } finally {
      aiService.callAISmart = originalSmart;
    }
  });
});

describe('POST /api/ai/test', () => {
  it('reports the admin\'s own app, not the one the body asks for', async () => {
    const { token } = await makeUserWithToken({ appClaim: 'basegeek', role: 'admin' });

    const originalCallProvider = aiService.callProvider;
    let providerOptions = null;
    aiService.callProvider = async (provider, prompt, options) => {
      providerOptions = options;
      return { content: 'OK' };
    };
    const hadKey = aiService.providers.groq.apiKey;
    aiService.providers.groq.apiKey = 'test-key-not-a-real-one';

    try {
      const res = await request(app)
        .post('/api/ai/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'groq', appName: 'storygeek' });

      expect(res.status).toBe(200);
      expect(res.body.data.appName).toBe('basegeek');
      expect(providerOptions.appName).toBe('basegeek');
    } finally {
      aiService.callProvider = originalCallProvider;
      aiService.providers.groq.apiKey = hadKey;
    }
  });
});

describe('POST /openai/v1/chat/completions', () => {
  it('attributes to the key — the only auth the proxy has', async () => {
    const { apiKey } = await makeApiKey({ appName: 'geekPR' });

    const res = await request(app)
      .post('/openai/v1/chat/completions')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        model: 'basegeek-app',
        messages: [{ role: 'user', content: 'hi' }],
        user: 'human-9',
      });

    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('geekpr');
    expect(captured.config.useAppConfig).toBe(true);
    // OpenAI's `user` field is honoured as the per-user attribution it is.
    expect(captured.config.userId).toBe('human-9');
  });
});

// ─────────────────────────── routing + usage rollup ─────────────────────────

describe('AIAppConfig lookup by resolved id', () => {
  it('finds the exact normalized row', async () => {
    await AIAppConfig.create({ appName: 'fitnessgeek', tier: 'rotation' });
    const found = await aiService.findAppConfig('fitnessgeek');
    expect(found.tier).toBe('rotation');
  });

  it('still finds the legacy mixed-case row an admin already pinned', async () => {
    await AIAppConfig.create({ appName: 'fitnessGeek', tier: 'specific', provider: 'groq', model: 'x' });
    const found = await aiService.findAppConfig('fitnessgeek');
    expect(found.appName).toBe('fitnessGeek');
    expect(found.tier).toBe('specific');
  });

  it('still finds a legacy app:feature row', async () => {
    await AIAppConfig.create({ appName: 'fitnessGeek:mealPlan', tier: 'free' });
    const found = await aiService.findAppConfig('fitnessgeek');
    expect(found.appName).toBe('fitnessGeek:mealPlan');
  });

  it('prefers the exact row over a legacy spelling', async () => {
    await AIAppConfig.create({ appName: 'fitnessGeek', tier: 'free' });
    await AIAppConfig.create({ appName: 'fitnessgeek', tier: 'rotation' });
    const found = await aiService.findAppConfig('fitnessgeek');
    expect(found.tier).toBe('rotation');
  });

  it('does not match a different app that merely starts the same', async () => {
    await AIAppConfig.create({ appName: 'fitnessgeekpro', tier: 'free' });
    expect(await aiService.findAppConfig('fitnessgeek')).toBeNull();
  });

  it('skips a disabled row', async () => {
    await AIAppConfig.create({ appName: 'fitnessgeek', tier: 'free', enabled: false });
    expect(await aiService.findAppConfig('fitnessgeek')).toBeNull();
  });
});

describe('usage breakdown', () => {
  it('collapses the three spellings into one app with features', async () => {
    aiService.resetSessionStats();

    await aiService.updateStats('groq', 100, 50, 'llama-x', 'fitnessGeek');
    await aiService.updateStats('groq', 100, 50, 'llama-x', 'fitnessgeek');
    await aiService.updateStats('groq', 100, 50, 'llama-x', 'fitnessgeek', 'mealPlan');

    const appUsage = aiService.getSessionStats().providerUsage.groq.appUsage;

    expect(Object.keys(appUsage)).toEqual(['fitnessgeek']);
    expect(appUsage.fitnessgeek.calls).toBe(3);
    expect(appUsage.fitnessgeek.tokens).toBe(450);
    expect(appUsage.fitnessgeek.features.mealplan.calls).toBe(1);
    expect(appUsage.fitnessgeek.features.mealplan.tokens).toBe(150);
  });

  it('leaves featureless apps with an empty feature map, not a missing one', async () => {
    aiService.resetSessionStats();
    await aiService.updateStats('groq', 10, 10, 'llama-x', 'startgeek');
    const appUsage = aiService.getSessionStats().providerUsage.groq.appUsage;
    expect(appUsage.startgeek.features).toEqual({});
  });
});
