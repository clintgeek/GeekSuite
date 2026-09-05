/**
 * aiProviderRoster.test.js — one provider list, read by everything.
 *
 * The roster used to be restated in five places: the REST config route, the
 * GraphQL config resolver, `aiService.providers`, `rotationProviderOverrides`
 * and `fallbackOrder`. They drifted — `llm7` and `onemin` were offered by both
 * config surfaces while `aiService.providers` defined neither, so a key saved
 * for either went to a provider that could not be called.
 *
 * `config/aiProviders.js` is now the one table. These cases fail if any
 * consumer starts keeping its own copy again, and they compare the REST
 * response, the GraphQL response and the rotation against that table rather
 * than against each other — agreeing on the wrong list would otherwise pass.
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
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');
const { default: aiService } = await import('../services/aiService.js');
const {
  AI_PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_MODELS,
  FALLBACK_ORDER,
  ROTATION_MODEL_OVERRIDES,
  keyHintFor,
} = await import('../config/aiProviders.js');

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

async function makeAdminToken() {
  const user = await User.create({
    username: `roster_admin_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    role: 'admin',
  });
  return {
    user,
    token: jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET),
  };
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
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the roster table itself', () => {
  it('has no duplicate ids and every row is complete', () => {
    expect(new Set(PROVIDER_IDS).size).toBe(PROVIDER_IDS.length);
    for (const provider of AI_PROVIDERS) {
      expect(typeof provider.id).toBe('string');
      expect(provider.label).toBeTruthy();
      expect(typeof provider.needsAccountId).toBe('boolean');
      expect(provider.defaultModel).toBeTruthy();
      expect(typeof provider.inRotation).toBe('boolean');
    }
  });

  it('no longer carries llm7 or onemin — neither had an implementation', () => {
    expect(PROVIDER_IDS).not.toContain('llm7');
    expect(PROVIDER_IDS).not.toContain('onemin');
  });

  it('gives every rotation member a distinct position and nobody else one', () => {
    const inRotation = AI_PROVIDERS.filter(p => p.inRotation);
    const positions = inRotation.map(p => p.rotationPosition);
    expect(positions.every(n => Number.isInteger(n))).toBe(true);
    expect(new Set(positions).size).toBe(positions.length);

    for (const provider of AI_PROVIDERS.filter(p => !p.inRotation)) {
      expect(provider.rotationPosition).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('every consumer draws from the same list', () => {
  it('aiService.providers defines exactly the roster — no more, no less', () => {
    expect(Object.keys(aiService.providers).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it('aiService.fallbackOrder is the rotation, in rotationPosition order', () => {
    expect(aiService.fallbackOrder).toEqual(FALLBACK_ORDER);
    expect(aiService.fallbackOrder).toEqual(
      AI_PROVIDERS
        .filter(p => p.inRotation)
        .sort((a, b) => a.rotationPosition - b.rotationPosition)
        .map(p => p.id)
    );
  });

  it('every fallback entry is a provider aiService can actually call', () => {
    for (const provider of aiService.fallbackOrder) {
      expect(aiService.providers[provider]).toBeDefined();
      expect(aiService.providers[provider].baseURL).toBeTruthy();
    }
  });

  it('rotation overrides pin the same model the provider defaults to', () => {
    expect(aiService.rotationProviderOverrides).toEqual(ROTATION_MODEL_OVERRIDES);
    for (const [provider, override] of Object.entries(ROTATION_MODEL_OVERRIDES)) {
      expect(override.model).toBe(DEFAULT_MODELS[provider]);
      expect(aiService.providers[provider].model).toBe(DEFAULT_MODELS[provider]);
    }
  });

  it('every provider carries its table default model', () => {
    for (const provider of AI_PROVIDERS) {
      expect(aiService.providers[provider.id].model).toBe(provider.defaultModel);
    }
  });

  it('only providers flagged needsAccountId have an accountId field', () => {
    for (const provider of AI_PROVIDERS) {
      const hasField = 'accountId' in aiService.providers[provider.id];
      expect(hasField).toBe(provider.needsAccountId);
    }
  });

  it('REST /api/ai/config returns exactly the roster', async () => {
    const admin = await makeAdminToken();
    const res = await request(app)
      .get('/api/ai/config')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...PROVIDER_IDS].sort());
    expect(res.body.llm7).toBeUndefined();
    expect(res.body.onemin).toBeUndefined();
  });

  it('GraphQL aiConfig returns exactly the roster', async () => {
    const admin = await makeAdminToken();
    const config = await resolvers.Query.aiConfig(null, null, {
      user: { id: admin.user._id.toString() },
    });

    expect(Object.keys(config).sort()).toEqual([...PROVIDER_IDS].sort());
    expect(config.llm7).toBeUndefined();
    expect(config.onemin).toBeUndefined();
  });

  it('the REST and GraphQL configs agree key for key', async () => {
    const admin = await makeAdminToken();
    const rest = await request(app)
      .get('/api/ai/config')
      .set('Authorization', `Bearer ${admin.token}`);
    const gql = await resolvers.Query.aiConfig(null, null, {
      user: { id: admin.user._id.toString() },
    });

    expect(rest.body).toEqual(gql);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('keyHintFor', () => {
  it('shows the last four characters and nothing else', () => {
    expect(keyHintFor('sk-ant-supersecret-abcd')).toBe('…abcd');
  });

  it('returns an empty hint rather than leak a very short key', () => {
    expect(keyHintFor('abc')).toBe('');
    expect(keyHintFor('')).toBe('');
    expect(keyHintFor(null)).toBe('');
    expect(keyHintFor(undefined)).toBe('');
  });
});
