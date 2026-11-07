/**
 * aiHardeningPaidPins.test.js — a pin does not get to skip the money gate.
 *
 * Until 2026-11-06 `planPinAttempt` hard-coded `paid: false`. The governor —
 * the one place that decides to spend money — runs only for `attempt.paid`, so
 * every pin was waved through unpriced and ungoverned: `/openai/v1` with
 * `openrouter/<a paid slug>` or the bare catalog id, `/feature` with an
 * explicit provider+model, `/parse-json` with `config.provider/model`, and a
 * routing row with `tier: 'specific'`. None of them read `allowPaid`, none of
 * them met the per-call or per-day cap, and the cost they ran up was booked —
 * if at all — through `resolveCostUsd`, which priced "no row" as $0.
 *
 * The rule now: a pinned model is FREE only when the catalog says so
 * (`AIFreeTier` `isFree: true` for that provider/model). Anything else is
 * paid: it needs the caller app's `allowPaid`, and it goes through the
 * governor, which refuses an unknown price before the call.
 *
 * Real `callAI`, real routes; only `callProvider` is faked.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AISpend } = await import('../models/AISpend.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { default: openaiProxyRoutes } = await import('../routes/openaiProxy.js');
const { runFeatureCore, _resetCounters } = await import('../services/aiFeatureRunner.js');
const { eventually } = await import('./eventually.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}
function enable(...providers) {
  for (const provider of providers) {
    patch(aiService.providers[provider], 'apiKey', 'test-key-not-a-real-credential');
    patch(aiService.providers[provider], 'enabled', true);
  }
}

let calls;
function fakeProviders() {
  calls = [];
  patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
    calls.push(`${provider}/${config.model}`);
    return { content: '{"ok": true}', inputTokens: 100, outputTokens: 100, finishReason: 'stop', headers: {} };
  });
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const httpLogger = pinoHttp({ logger, genReqId: () => crypto.randomUUID(), autoLogging: false });
  app.use((req, res, next) => { httpLogger(req, res); next(); });
  app.use('/api/ai', aiRoutes);
  app.use('/openai/v1', openaiProxyRoutes);
  return app;
}

async function makeKey(appName = 'testgeek') {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash, keyPrefix,
    name: `hardening paid pins ${crypto.randomUUID()}`,
    appName,
    permissions: ['ai:call', 'ai:models'],
    createdBy: new mongoose.Types.ObjectId(),
    rateLimit: { requestsPerMinute: 1000, requestsPerHour: 10000 },
  });
  return apiKey;
}

async function clean() {
  await Promise.all([
    AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}),
    AIPricing.deleteMany({}), AISpend.deleteMany({}),
  ]);
}

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  // The singleton loads its provider connections from Mongo on import and
  // REPLACES `aiService.providers` when it finishes; a key patched before that
  // lands is silently lost. Wait for it.
  for (let i = 0; i < 200 && !aiService.initialized; i += 1) await new Promise((r) => setTimeout(r, 25));
});

beforeEach(async () => {
  patch(aiService, 'initialized', true);
  aiService.freeTierHealth.clear();
  aiService.clearCache();
  aiService.pricingCache.clear();
  _resetCounters();
  for (const bucket of Object.values(aiService.rateLimits)) delete bucket.rateLimitedUntil;
  patch(aiUsageService, 'trackUsage', async () => ({ success: true }));
  await clean();
  // The catalog knows both models, so no pin degrades as `pin_absent`.
  await AIModel.create([
    { provider: 'openrouter', modelId: 'vendor/paid-model', name: 'Paid', isActive: true },
    { provider: 'openrouter', modelId: 'vendor/free-model:free', name: 'Free', isActive: true },
    { provider: 'openrouter', modelId: 'vendor/unpriced', name: 'Unpriced', isActive: true },
    { provider: 'openrouter', modelId: 'vendor/zero-default', name: 'Zero', isActive: true },
  ]);
  // $0.1 per 1M each way: 600 tokens out + a short prompt is far under a cent.
  await AIPricing.create({ provider: 'openrouter', modelId: 'vendor/paid-model', inputPrice: 0.1, outputPrice: 0.1 });
  // A row with the schema's defaults (0/0) is not a price anybody gave us.
  await AIPricing.create({ provider: 'openrouter', modelId: 'vendor/zero-default' });
  await AIFreeTier.create({ provider: 'openrouter', modelId: 'vendor/free-model:free', isFree: true });
  enable('openrouter');
  fakeProviders();
});

afterEach(() => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
  aiService.clearCache();
});

afterAll(async () => {
  await clean();
  await APIKey.deleteMany({ name: /^hardening paid pins/ });
});

const PIN = { provider: 'openrouter', model: 'vendor/paid-model' };

describe('callAI: a pin is classified by the catalog, not assumed free', () => {
  it('refuses a pin to a priced paid model for an app that does not allow paid', async () => {
    await expect(aiService.callAI('hi', { appName: 'testgeek', ...PIN })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('refuses it with no routing row at all — no row is not permission', async () => {
    await expect(aiService.callAI('hi', { appName: 'nobodygeek', ...PIN })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('allows it, governed and priced, for an app with allowPaid', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    const { content, info } = await aiService.callAIWithInfo('hi', { appName: 'testgeek', ...PIN, maxTokens: 600 });
    expect(content).toBe('{"ok": true}');
    expect(calls).toEqual(['openrouter/vendor/paid-model']);
    // 200 tokens × $0.1/1M — booked from the price table, not as free.
    expect(info.costUsd).toBeCloseTo(0.00002, 10);
  });

  it('refuses a paid pin whose per-call estimate is over the cap, even with allowPaid', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    await AIPricing.updateOne({ provider: 'openrouter', modelId: 'vendor/paid-model' }, { inputPrice: 500, outputPrice: 500 });
    await expect(aiService.callAI('hi', { appName: 'testgeek', ...PIN, maxTokens: 4000 })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('refuses an unpriced pin — unknown is never free', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    await expect(aiService.callAI('hi', { appName: 'testgeek', provider: 'openrouter', model: 'vendor/unpriced' })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('refuses a pin whose only "price" is the schema default 0/0', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    await expect(aiService.callAI('hi', { appName: 'testgeek', provider: 'openrouter', model: 'vendor/zero-default' })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('keeps an intentional free pin working with no routing row', async () => {
    await expect(aiService.callAI('hi', { appName: 'nobodygeek', provider: 'openrouter', model: 'vendor/free-model:free' }))
      .resolves.toBe('{"ok": true}');
    expect(calls).toEqual(['openrouter/vendor/free-model:free']);
  });

  it('a routing row\'s tier:specific pin to a paid model obeys the same row\'s allowPaid', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'specific', provider: 'openrouter', model: 'vendor/paid-model', allowPaid: false });
    await expect(aiService.callAI('hi', { appName: 'testgeek' })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('the governor reads prices honestly', () => {
  it('a 0/0 pricing row is not a $0 estimate (paidGovernorVerdict)', async () => {
    const verdict = await aiService.paidGovernorVerdict({ provider: 'openrouter', modelId: 'vendor/zero-default', promptTokens: 10, maxTokens: 10 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('paid_estimate_unknown');
  });

  it('a call with no known price books an unknown cost, not $0', async () => {
    const booked = await aiService.updateStats('openrouter', 100, 100, 'vendor/unpriced', 'testgeek', 'probe', null);
    expect(booked.costUsd).toBeNull();
    const row = await eventually(() => AISpend.findOne({ app: 'testgeek', feature: 'probe' }).lean(), { what: 'the spend row' });
    expect(row.costUnknown).toBe(1);
    expect(row.costUsd).toBe(0);
  });

  it('a known-free row with no pricing row still books $0', async () => {
    const booked = await aiService.updateStats('openrouter', 100, 100, 'vendor/free-model:free', 'testgeek', 'free', null, { knownFree: true });
    expect(booked.costUsd).toBe(0);
  });
});

describe('every front door', () => {
  it('/openai/v1: a <provider>/<model> pin to a paid model is refused for a non-paying app', async () => {
    const key = await makeKey();
    const res = await request(buildApp())
      .post('/openai/v1/chat/completions')
      .set('Authorization', `Bearer ${key}`)
      .send({ model: 'openrouter/vendor/paid-model', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls).toEqual([]);
  });

  it('/openai/v1: a bare catalog id of a paid model is refused for a non-paying app', async () => {
    const key = await makeKey();
    const res = await request(buildApp())
      .post('/openai/v1/chat/completions')
      .set('Authorization', `Bearer ${key}`)
      .send({ model: 'vendor/paid-model', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls).toEqual([]);
  });

  it('/feature: an explicit provider+model pin to a paid model is refused for a non-paying app', async () => {
    const key = await makeKey();
    const res = await request(buildApp())
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${key}`)
      .send({ feature: 'probe', user: 'hi', ...PIN });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('/feature: the same pin is served for an app that allows paid', async () => {
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    const out = await runFeatureCore({ app: 'testgeek', feature: 'probe', user: 'hi', ...PIN, timeoutMs: 5000 });
    expect(out.ok).toBe(true);
    expect(calls).toEqual(['openrouter/vendor/paid-model']);
  });

  it('/parse-json: config.provider/model to a paid model is refused for a non-paying app', async () => {
    const key = await makeKey();
    const res = await request(buildApp())
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${key}`)
      .send({ prompt: 'hi', config: { ...PIN } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls).toEqual([]);
  });

  it('/parse-json: a body cannot hand callAI a pre-built route that allows paid', async () => {
    const key = await makeKey();
    const res = await request(buildApp())
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${key}`)
      .send({
        prompt: 'hi',
        config: {
          route: {
            mode: 'auto', provider: null, model: null, allowPaid: true, singleAttempt: true,
            sticky: null, paidFirst: { provider: 'openrouter', model: 'vendor/paid-model' }, paidOnly: true, hints: [],
          },
        },
      });
    // The forged route is ignored: the call is an ordinary `auto` walk for an
    // app that may not spend, so only the free row may answer it.
    expect(calls).not.toContain('openrouter/vendor/paid-model');
    expect(calls.every((c) => c === 'openrouter/vendor/free-model:free')).toBe(true);
    expect(res.status).toBe(200);
  });
});
