/**
 * aiModelSteward.test.js — aiGeek answering "which free model fits this?"
 *
 * The steward surface exists because the free tiers move. StartGeek Ask routes
 * through `model: "basegeek-app"` with app id `startgeek`, so the model it uses
 * is a row in AIAppConfig, not a constant in code — and something has to fill
 * that row well. Two questions, one service, three transports:
 *
 *   listFreeModels()                 → GraphQL aiFreeModels, GET /director/free-models
 *   recommendProvider(task, {...})   → GraphQL aiRecommendModel, POST /director/recommend
 *
 * What is asserted here, and why each matters:
 *
 *   1. `freeOnly` really filters. A $0.00 price on a paid account is still a
 *      paid account, so "free" has to come from the AIFreeTier record and
 *      nothing else — including for models with no capability data, which the
 *      requirement filter otherwise waves through.
 *   2. The old positional call still works. StoryGeek's epub pipeline posts
 *      `{ task, priority, requirements }` and reads `recommendations[0].
 *      model.id` back out; a signature change there is a silent regression in
 *      another app.
 *   3. `listFreeModels` shape. Callers pick a model from these fields, so a
 *      capability flag must be a real boolean and a price that the catalog
 *      does not know must be null, not the string 'Unknown' (a Float field
 *      cannot carry it).
 *   4. The GraphQL reads are authenticated but NOT admin — an app has to be
 *      able to ask — while the routing mutations stay admin-gated.
 *   5. The REST route exists, is authenticated, and carries the same data.
 *
 * Mongo is the shared in-memory instance (globalSetup), the way the other AI
 * suites use it. `collectModelInformation` is spied out the way
 * aiPricingUnits.test.js does: it talks to every provider API and to the
 * catalog, and none of that is what is under test here.
 */

import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: aiDirectorService } = await import('../services/aiDirectorService.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A free Groq model with full capability data — the happy path. */
const GROQ_FREE = {
  id: 'llama-3.3-70b-versatile',
  name: 'Llama 3.3 70B Versatile',
  pricing: { input: 0.0007, output: 0.0007 },
  freeTier: {
    isFree: true,
    limits: { requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 18000, tokensPerDay: 5184000 },
    notes: 'Free tier - PRIMARY recommended model'
  },
  capabilities: {
    contextWindow: 131072,
    maxTokens: 32768,
    supportsVision: false,
    supportsAudio: false,
    supportsFunctionCalling: true,
    supportsToolCalling: true,
    supportsJSONOutput: true,
    supportsJSONMode: false,
    supportsJSONSchema: false,
    tasks: { codeGeneration: true, structuredOutput: true },
    performance: { speed: 'ultra-fast', quality: 'excellent', reasoning: 'excellent' }
  }
};

/** Paid, and priced at zero nowhere — the model freeOnly must drop. */
const ANTHROPIC_PAID = {
  id: 'claude-sonnet-5',
  name: 'Claude Sonnet 5',
  pricing: { input: 3, output: 15 },
  freeTier: { isFree: false, limits: {}, notes: '' },
  capabilities: {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsJSONOutput: true,
    tasks: { codeGeneration: true },
    performance: { speed: 'fast', quality: 'state-of-the-art', reasoning: 'state-of-the-art' }
  }
};

/**
 * No capability data at all, and not free. The requirement filter includes
 * such models unconditionally ("include if no capabilities data"), so this is
 * the one that proves freeOnly is checked *before* that escape hatch.
 */
const TOGETHER_UNKNOWN_PAID = {
  id: 'mystery-paid',
  name: 'Mystery Paid',
  pricing: { input: 'Unknown', output: 'Unknown' },
  freeTier: { isFree: false, limits: {}, notes: '' },
  capabilities: null
};

/** Free, but the catalog knows nothing else about it. */
const TOGETHER_FREE_SPARSE = {
  id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
  name: 'Llama 3.3 70B Turbo Free',
  pricing: { input: 'Unknown', output: 'Unknown' },
  freeTier: { isFree: true, limits: {}, notes: 'Free tier - rotating availability' }
};

const catalog = () => ({
  success: true,
  data: {
    providers: {
      anthropic: { hasApiKey: true, isEnabled: true, totalModels: 1, models: [ANTHROPIC_PAID] },
      groq: { hasApiKey: true, isEnabled: true, totalModels: 1, models: [GROQ_FREE] },
      together: {
        hasApiKey: true, isEnabled: true, totalModels: 2,
        models: [TOGETHER_UNKNOWN_PAID, TOGETHER_FREE_SPARSE]
      },
      // Free models nobody can reach: no key, and disabled. Both must be
      // invisible — a free model on an unreachable provider is a tease.
      cerebras: {
        hasApiKey: false, isEnabled: true, totalModels: 1,
        models: [{ ...GROQ_FREE, id: 'unreachable-nokey', name: 'Unreachable No Key' }]
      },
      openrouter: {
        hasApiKey: true, isEnabled: false, totalModels: 1,
        models: [{ ...GROQ_FREE, id: 'unreachable-disabled', name: 'Unreachable Disabled' }]
      }
    },
    summary: {}
  }
});

const mockCatalog = () =>
  jest.spyOn(aiDirectorService, 'collectModelInformation').mockResolvedValue(catalog());

// ─── Harness ─────────────────────────────────────────────────────────────────

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

async function makeUserWithToken(overrides = {}) {
  const user = await User.create({
    username: `steward_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, token };
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
  await User.deleteMany({});
  await AIModel.deleteMany({});
  await AIFreeTier.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('recommendProvider — freeOnly', () => {
  it('drops every model whose free-tier record does not say isFree', async () => {
    mockCatalog();

    const result = await aiDirectorService.recommendProvider('summarize a note', { freeOnly: true });

    expect(result.success).toBe(true);
    expect(result.data.freeOnly).toBe(true);

    const providers = result.data.recommendations.map(r => r.provider).sort();
    expect(providers).toEqual(['groq', 'together']);
    expect(providers).not.toContain('anthropic');
    expect(result.data.recommendations.every(r => r.isFree)).toBe(true);
  });

  it('keeps paid models when freeOnly is off — the old behaviour', async () => {
    mockCatalog();

    const result = await aiDirectorService.recommendProvider('summarize a note', { freeOnly: false });

    expect(result.data.recommendations.map(r => r.provider).sort())
      .toEqual(['anthropic', 'groq', 'together']);
  });

  it('drops a paid model even when the catalog knows no capabilities for it', async () => {
    // together offers one paid model with capabilities: null and one free one.
    // The requirement filter waves capability-less models through, so if
    // freeOnly were checked after it, "Mystery Paid" would win together's slot
    // on price (0 + 0 for an unknown price) and be recommended as free.
    mockCatalog();

    const result = await aiDirectorService.recommendProvider('summarize a note', { freeOnly: true });
    const together = result.data.recommendations.find(r => r.provider === 'together');

    expect(together.model.id).toBe(TOGETHER_FREE_SPARSE.id);
    expect(together.model.id).not.toBe(TOGETHER_UNKNOWN_PAID.id);
  });

  it('honours limit, ranked best-first', async () => {
    mockCatalog();

    const result = await aiDirectorService.recommendProvider('summarize a note', {
      freeOnly: true, priority: 'speed', limit: 1
    });

    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.recommendations[0].provider).toBe('groq'); // ultra-fast
  });

  it('carries a fit score and a human reason on every candidate', async () => {
    mockCatalog();

    const result = await aiDirectorService.recommendProvider(
      'turn a search query into a JSON search plan', { freeOnly: true }
    );
    const groq = result.data.recommendations.find(r => r.provider === 'groq');

    expect(typeof groq.score).toBe('number');
    expect(groq.score).toBeGreaterThan(0);
    expect(groq.score).toBeLessThanOrEqual(100);
    expect(groq.reasoning).toContain('Free tier available');
    expect(groq.reasoning).toContain('Returns structured JSON');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('recommendProvider — the positional call StoryGeek makes', () => {
  it('still reads a numeric second argument as budget', async () => {
    mockCatalog();

    const result = await aiDirectorService.recommendProvider('write a chapter', 5, 'quality', {});

    expect(result.success).toBe(true);
    expect(result.data.budget).toBe(5);
    expect(result.data.priority).toBe('quality');
    expect(result.data.freeOnly).toBe(false);
    // Paid providers are still candidates without freeOnly — the old default.
    expect(result.data.recommendations.map(r => r.provider)).toContain('anthropic');
  });

  it('still returns { provider, model: { id } } — what StoryGeek reads back', async () => {
    mockCatalog();

    // The exact call apps/storygeek/backend/src/services/aiService.js makes
    // through POST /api/ai/director/recommend.
    const result = await aiDirectorService.recommendProvider('epub chapter polish', null, 'cost', {});
    const [top] = result.data.recommendations;

    expect(typeof top.provider).toBe('string');
    expect(typeof top.model.id).toBe('string');
    expect(top.model.name).toBeDefined();
    expect(top.capabilities !== undefined).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseTaskRequirements — the documented keywords', () => {
  it('reads a search plan as needing structured output', () => {
    const req = aiDirectorService.parseTaskRequirements(
      'Turn a natural language query into a search plan for the suite'
    );
    expect(req.needsJSONOutput).toBe(true);
  });

  it('reads json / structured / schema the same way', () => {
    for (const task of ['return JSON', 'structured output please', 'match this schema']) {
      expect(aiDirectorService.parseTaskRequirements(task).needsJSONOutput).toBe(true);
    }
  });

  it('reads tool and function as function calling', () => {
    expect(aiDirectorService.parseTaskRequirements('call a tool').needsFunctionCalling).toBe(true);
    expect(aiDirectorService.parseTaskRequirements('function calling').needsFunctionCalling).toBe(true);
  });

  it('lets an explicit requirement win over a silent description', () => {
    const req = aiDirectorService.parseTaskRequirements('say hello', { needsJSONOutput: true });
    expect(req.needsJSONOutput).toBe(true);
    expect(aiDirectorService.parseTaskRequirements('say hello').needsJSONOutput).toBe(false);
  });

  it('survives a missing description instead of throwing on toLowerCase', () => {
    expect(aiDirectorService.parseTaskRequirements(undefined).needsVision).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('listFreeModels — shape', () => {
  it('returns only free models on providers that are enabled and keyed', async () => {
    mockCatalog();

    const result = await aiDirectorService.listFreeModels();

    expect(result.success).toBe(true);
    const ids = result.data.models.map(m => m.modelId);
    expect(ids).toContain(GROQ_FREE.id);
    expect(ids).toContain(TOGETHER_FREE_SPARSE.id);
    expect(ids).not.toContain(ANTHROPIC_PAID.id);
    expect(ids).not.toContain(TOGETHER_UNKNOWN_PAID.id);
    expect(ids).not.toContain('unreachable-nokey');
    expect(ids).not.toContain('unreachable-disabled');

    expect(result.data.count).toBe(result.data.models.length);
    expect(result.data.providers.sort()).toEqual(['groq', 'together']);
  });

  it('flattens every property a caller picks a model by', async () => {
    mockCatalog();

    const { data } = await aiDirectorService.listFreeModels();
    const groq = data.models.find(m => m.modelId === GROQ_FREE.id);

    expect(groq).toMatchObject({
      provider: 'groq',
      modelId: GROQ_FREE.id,
      name: 'Llama 3.3 70B Versatile',
      contextWindow: 131072,
      maxTokens: 32768,
      supportsFunctionCalling: true,
      supportsToolCalling: true,
      supportsJSONOutput: true,
      supportsJSONMode: false,
      supportsJSONSchema: false,
      supportsVision: false,
      supportsAudio: false,
      isFree: true,
      performance: { speed: 'ultra-fast', quality: 'excellent', reasoning: 'excellent' },
      freeLimits: {
        requestsPerMinute: 30, requestsPerDay: 14400,
        tokensPerMinute: 18000, tokensPerDay: 5184000
      },
      pricing: { input: 0.0007, output: 0.0007 }
    });
    expect(groq.notes).toContain('Free tier');
  });

  it('normalizes unknown properties to null rather than undefined or a string', async () => {
    mockCatalog();

    const { data } = await aiDirectorService.listFreeModels();
    const sparse = data.models.find(m => m.modelId === TOGETHER_FREE_SPARSE.id);

    // 'Unknown' is what collectModelInformation puts in pricing with no
    // AIPricing row; a Float field cannot carry it.
    expect(sparse.pricing).toEqual({ input: null, output: null });
    expect(sparse.contextWindow).toBeNull();
    expect(sparse.performance).toEqual({ speed: null, quality: null, reasoning: null });
    expect(sparse.freeLimits).toEqual({
      requestsPerMinute: null, requestsPerDay: null,
      tokensPerMinute: null, tokensPerDay: null
    });
    // Capability flags are real booleans, so false means false and not
    // "we never asked".
    expect(sparse.supportsJSONOutput).toBe(false);
    expect(sparse.supportsVision).toBe(false);
  });

  it('carries lastSeen and updatedAt from the catalog when it has them', async () => {
    mockCatalog();

    const lastChecked = new Date('2026-09-01T12:00:00Z');
    await AIModel.create({
      provider: 'groq', modelId: GROQ_FREE.id, name: GROQ_FREE.name,
      isActive: true, lastChecked
    });
    await AIFreeTier.create({ provider: 'groq', modelId: GROQ_FREE.id, isFree: true });

    const { data } = await aiDirectorService.listFreeModels();
    const groq = data.models.find(m => m.modelId === GROQ_FREE.id);

    expect(new Date(groq.lastSeen).toISOString()).toBe(lastChecked.toISOString());
    // The free-tier row was written just now, so it is the newer stamp.
    expect(new Date(groq.updatedAt).getTime()).toBeGreaterThan(lastChecked.getTime());
  });

  it('reports null stamps rather than failing when the catalog has no rows', async () => {
    mockCatalog();

    const { data } = await aiDirectorService.listFreeModels();
    const sparse = data.models.find(m => m.modelId === TOGETHER_FREE_SPARSE.id);

    expect(sparse.lastSeen).toBeNull();
    expect(sparse.updatedAt).toBeNull();
  });

  it('propagates a catalog failure instead of reporting zero free models', async () => {
    jest.spyOn(aiDirectorService, 'collectModelInformation').mockResolvedValue({
      success: false, error: { message: 'Failed to collect model information' }
    });

    const result = await aiDirectorService.listFreeModels();
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GraphQL — the steward is authenticated, not admin', () => {
  it('aiFreeModels is UNAUTHENTICATED with no user', async () => {
    await expect(resolvers.Query.aiFreeModels(null, null, { user: null }))
      .rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('aiRecommendModel is UNAUTHENTICATED with no user', async () => {
    await expect(resolvers.Query.aiRecommendModel(null, { task: 'x' }, { user: null }))
      .rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('aiFreeModels answers a plain (non-admin) user — apps have to be able to ask', async () => {
    mockCatalog();
    const { user } = await makeUserWithToken();

    const models = await resolvers.Query.aiFreeModels(null, null, {
      user: { id: user._id.toString() }
    });

    expect(Array.isArray(models)).toBe(true);
    expect(models.map(m => m.modelId)).toContain(GROQ_FREE.id);
    expect(models.every(m => m.isFree)).toBe(true);
    // Nothing credential-shaped comes back with it.
    expect(JSON.stringify(models)).not.toContain('apiKey');
  });

  it('aiRecommendModel returns a ranked list in the AIRecommendedModel shape', async () => {
    mockCatalog();
    const { user } = await makeUserWithToken();

    const result = await resolvers.Query.aiRecommendModel(
      null,
      { task: 'turn a query into a JSON search plan', priority: 'speed', limit: 3 },
      { user: { id: user._id.toString() } }
    );

    expect(result.task).toBe('turn a query into a JSON search plan');
    expect(result.priority).toBe('speed');
    expect(result.freeOnly).toBe(true); // the steward's default
    expect(result.requirements.needsJSONOutput).toBe(true);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);

    const [top] = result.recommendations;
    expect(top).toMatchObject({
      provider: expect.any(String),
      modelId: expect.any(String),
      name: expect.any(String),
      reasoning: expect.any(String),
      isFree: true
    });
    expect(typeof top.score).toBe('number');
    expect(top.performance).toBeDefined();
    expect(top.freeLimits).toBeDefined();
    expect(top.pricing).toBeDefined();
    // The GraphQL shape is flat — no nested `model` object to dig through.
    expect(top.model).toBeUndefined();
  });

  it('aiRecommendModel can be asked for paid candidates explicitly', async () => {
    mockCatalog();
    const { user } = await makeUserWithToken();

    const result = await resolvers.Query.aiRecommendModel(
      null,
      { task: 'write a chapter', priority: 'quality', freeOnly: false },
      { user: { id: user._id.toString() } }
    );

    expect(result.freeOnly).toBe(false);
    expect(result.recommendations.map(r => r.provider)).toContain('anthropic');
  });

  it('aiRecommendModel refuses an empty task', async () => {
    const { user } = await makeUserWithToken();
    await expect(resolvers.Query.aiRecommendModel(
      null, { task: '   ' }, { user: { id: user._id.toString() } }
    )).rejects.toThrow('task is required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REST — /api/ai/director/free-models', () => {
  it('401s anonymously and answers an authenticated user', async () => {
    mockCatalog();

    const anon = await request(app).get('/api/ai/director/free-models');
    expect(anon.status).toBe(401);

    const { token } = await makeUserWithToken();
    const res = await auth(request(app).get('/api/ai/director/free-models'), token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.models.map(m => m.modelId)).toContain(GROQ_FREE.id);
    expect(res.body.data.models.map(m => m.modelId)).not.toContain(ANTHROPIC_PAID.id);
    expect(res.body.data.count).toBe(res.body.data.models.length);
  });

  it('reports a catalog failure as a 500 with a code, not an empty list', async () => {
    jest.spyOn(aiDirectorService, 'collectModelInformation').mockResolvedValue({
      success: false, error: { message: 'nope', details: 'catalog down' }
    });
    const { token } = await makeUserWithToken();

    const res = await auth(request(app).get('/api/ai/director/free-models'), token);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DIRECTOR_FREE_MODELS_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REST — /api/ai/director/recommend keeps its body shape', () => {
  it('accepts freeOnly as an optional field', async () => {
    mockCatalog();
    const { token } = await makeUserWithToken();

    const res = await auth(request(app).post('/api/ai/director/recommend'), token)
      .send({ task: 'summarize a note', priority: 'cost', freeOnly: true });

    expect(res.status).toBe(200);
    expect(res.body.data.freeOnly).toBe(true);
    expect(res.body.data.recommendations.map(r => r.provider)).not.toContain('anthropic');
  });

  it('behaves exactly as before without it — the StoryGeek body', async () => {
    mockCatalog();
    const { token } = await makeUserWithToken();

    const res = await auth(request(app).post('/api/ai/director/recommend'), token)
      .send({ task: 'epub chapter polish', priority: 'cost', requirements: {} });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const [top] = res.body.data.recommendations;
    // What StoryGeek destructures: rec.provider and rec.model.id.
    expect(top.provider).toBeTruthy();
    expect(top.model.id).toBeTruthy();
    expect(res.body.data.recommendations.map(r => r.provider)).toContain('anthropic');
  });

  it('still 400s with no task', async () => {
    const { token } = await makeUserWithToken();
    const res = await auth(request(app).post('/api/ai/director/recommend'), token).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_TASK');
  });
});
