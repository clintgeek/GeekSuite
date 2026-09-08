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
  ADAPTER_DESCRIPTORS,
  TOOL_FORWARDING_PROVIDERS,
  buildProviderConnections,
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

  it('gives every row an adapter descriptor, and every descriptor an adapter', async () => {
    // Phase 2: a row carries how to *talk* to the provider, not just its name.
    // This is the assertion that makes "adding a provider is one row" true —
    // a row with no shape, or a shape no adapter answers to, fails here rather
    // than at the first call.
    const { ADAPTER_SHAPES, ADAPTERS } = await import('../services/ai/adapters/index.js');
    for (const provider of AI_PROVIDERS) {
      const descriptor = ADAPTER_DESCRIPTORS[provider.id];
      expect(descriptor).toBeDefined();
      expect(ADAPTER_SHAPES).toContain(descriptor.shape);
      expect(typeof ADAPTERS[descriptor.shape].call).toBe('function');
      expect(descriptor.baseURL).toBeTruthy();
      expect(descriptor.name).toBeTruthy();
      expect(descriptor.maxTokens).toBeGreaterThan(0);
      expect(typeof descriptor.temperature).toBe('number');
      expect(descriptor.needsAccountId).toBe(provider.needsAccountId);
    }
  });

  it('derives the three adapter-fact sets from the descriptors, not from a second list', async () => {
    // These were hand-kept Sets in aiModelCapabilitiesService until Phase 2 —
    // which is how a provider could be listed as tool-capable with no adapter
    // behind it (F-04). The service re-exports them now; the roster owns them.
    const caps = await import('../services/aiModelCapabilitiesService.js');
    expect(caps.TOOL_FORWARDING_PROVIDERS).toBe(TOOL_FORWARDING_PROVIDERS);
    expect([...TOOL_FORWARDING_PROVIDERS].sort()).toEqual(
      AI_PROVIDERS.filter(p => p.adapter.forwardsTools).map(p => p.id).sort()
    );
    expect([...caps.JSON_SCHEMA_SUPPORTED].sort()).toEqual(
      AI_PROVIDERS.filter(p => p.adapter.nativeJsonSchema).map(p => `${p.id}:*`).sort()
    );
    expect([...caps.JSON_MODE_SUPPORTED].sort()).toEqual(
      AI_PROVIDERS.filter(p => p.adapter.nativeJsonMode).map(p => `${p.id}:*`).sort()
    );
    // Every id in a set is a live provider — a set cannot outlive its adapter.
    for (const id of TOOL_FORWARDING_PROVIDERS) expect(PROVIDER_IDS).toContain(id);
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

  it('aiService.providers IS the roster\'s connection table, not a second copy of it', async () => {
    // Until Phase 2 this was ~100 hand-typed lines in the aiService
    // constructor: base URL, display name, ceilings and default model, restated
    // for all nine providers. The two could disagree — and this file exists
    // because they did. `buildProviderConnections()` is the one builder now.
    const fresh = buildProviderConnections();
    expect(Object.keys(fresh).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const id of PROVIDER_IDS) {
      const live = aiService.providers[id];
      // apiKey / enabled / model move at runtime (loadConfigurations, the
      // admin page); the address and the ceilings do not.
      expect(live.baseURL).toBe(fresh[id].baseURL);
      expect(live.name).toBe(fresh[id].name);
      expect(live.maxContextTokens).toBe(fresh[id].maxContextTokens);
      expect(live.baseURL).toBe(ADAPTER_DESCRIPTORS[id].baseURL);
      // maxTokens and temperature are the two ceilings an admin MAY override
      // per provider (AIConfig row → loadConfigurations). The suite shares one
      // database across files: another file can create such a row, this
      // file's aiService loads it at import, and the row is gone again before
      // this line runs — so neither the roster value nor a lookup is a stable
      // expectation (CI, 2026-09-08). The "one table" claim is carried by the
      // address, the name and the context ceiling above, plus the builder
      // check below; here we only ask that the ceilings are sane numbers.
      expect(live.maxTokens).toBeGreaterThan(0);
      expect(live.temperature).toBeGreaterThanOrEqual(0);
      expect(fresh[id].maxTokens).toBe(ADAPTER_DESCRIPTORS[id].maxTokens);
    }
    // Each call hands back its own objects — aiService mutates these rows.
    expect(fresh.groq).not.toBe(buildProviderConnections().groq);
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
