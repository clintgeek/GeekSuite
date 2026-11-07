/**
 * aiHardeningProviderInfo.test.js — every caller gets its OWN call's metadata.
 *
 * Until 2026-11-06 `aiService` was a singleton that wrote which provider and
 * model answered, the tool calls, the finish reason and the cost onto one
 * shared field, `lastProviderInfo`, and every front door read that field back
 * *after* its `await`. Two overlapping calls therefore raced: whichever wrote
 * last was reported to both. On `/openai/v1` that is the wrong `model`, the
 * wrong `tool_calls` and the wrong `finish_reason` handed to an SDK; on the
 * feature door it is the wrong `provenance.costUsd`.
 *
 * The interleaving here is deliberate, not hoped for. Both calls are held at
 * the last await inside `callAI` (`aiUsageService.trackUsage`) and released in
 * the same tick, first call first — so the first call finishes writing its
 * metadata, and the second call's continuation runs (and, before the fix,
 * overwrote the shared field) before the first caller's continuation reads it.
 *
 * The provider layer is faked at `callProvider` (no HTTP); everything above it
 * — routing, pins, stats, the runner and the proxy route — is real.
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
const { default: openaiProxyRoutes } = await import('../routes/openaiProxy.js');
const { runFeatureCore, _resetCounters } = await import('../services/aiFeatureRunner.js');

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

/** What each fake model answers — distinct on every field a reader reports. */
const ANSWERS = {
  'groq/model-a': {
    content: 'answer from A', inputTokens: 3, outputTokens: 5, finishReason: 'length',
    toolCalls: [{ id: 'call_a', type: 'function', function: { name: 'tool_a', arguments: '{}' } }],
  },
  'cerebras/model-b': {
    content: 'answer from B', inputTokens: 7, outputTokens: 11, finishReason: 'stop', toolCalls: null,
  },
};

/**
 * Hold both calls at `trackUsage` until both have arrived, then release them in
 * the same tick, A first. That is the schedule under which a shared field is
 * overwritten between a writer and its reader.
 */
function interleaveAtTrackUsage() {
  const waiting = [];
  const original = aiUsageService.trackUsage;
  patch(aiUsageService, 'trackUsage', async (provider, modelId) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    waiting.push({ key: `${provider}/${modelId}`, release });
    if (waiting.length === 2) {
      const order = [...waiting].sort((x) => (x.key === 'groq/model-a' ? -1 : 1));
      for (const w of order) w.release();
    }
    await gate;
    return { success: true };
  });
  return { original };
}

function fakeProviders({ slowFirst = true } = {}) {
  patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
    const key = `${provider}/${config.model}`;
    const answer = ANSWERS[key];
    if (!answer) throw new Error(`unexpected provider call: ${key}`);
    // A starts first and answers last.
    if (slowFirst && key === 'groq/model-a') await new Promise((r) => setTimeout(r, 30));
    return { ...answer, headers: {} };
  });
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
  _resetCounters();
  for (const bucket of Object.values(aiService.rateLimits)) delete bucket.rateLimitedUntil;
  await AIFreeTier.deleteMany({});
  await AIAppConfig.deleteMany({});
  await AIFreeTier.insertMany([
    { provider: 'groq', modelId: 'model-a', isFree: true },
    { provider: 'cerebras', modelId: 'model-b', isFree: true },
  ]);
  enable('groq', 'cerebras');
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
  await AIFreeTier.deleteMany({});
  await APIKey.deleteMany({ name: /^hardening provider info/ });
});

describe('the feature runner reports its own call, not the last one to finish', () => {
  it('two overlapping runFeatureCore calls each get their own provider/model/finishReason', async () => {
    fakeProviders();
    interleaveAtTrackUsage();

    const [a, b] = await Promise.all([
      runFeatureCore({ app: 'testgeek', feature: 'a', user: 'q-a', provider: 'groq', model: 'model-a', timeoutMs: 5000 }),
      runFeatureCore({ app: 'testgeek', feature: 'b', user: 'q-b', provider: 'cerebras', model: 'model-b', timeoutMs: 5000 }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.data).toBe('answer from A');
    expect(b.data).toBe('answer from B');
    expect({ p: a.provenance.provider, m: a.provenance.model, f: a.provenance.finishReason })
      .toEqual({ p: 'groq', m: 'model-a', f: 'length' });
    expect({ p: b.provenance.provider, m: b.provenance.model, f: b.provenance.finishReason })
      .toEqual({ p: 'cerebras', m: 'model-b', f: 'stop' });
  });
});

describe('/openai/v1 reports its own call, not the last one to finish', () => {
  function buildApp() {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    const httpLogger = pinoHttp({ logger, genReqId: () => crypto.randomUUID(), autoLogging: false });
    app.use((req, res, next) => { httpLogger(req, res); next(); });
    app.use('/openai/v1', openaiProxyRoutes);
    return app;
  }

  async function makeKey() {
    const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
    await APIKey.create({
      keyHash, keyPrefix,
      name: `hardening provider info ${crypto.randomUUID()}`,
      appName: 'testgeek',
      permissions: ['ai:call'],
      createdBy: new mongoose.Types.ObjectId(),
      rateLimit: { requestsPerMinute: 1000, requestsPerHour: 10000 },
    });
    return apiKey;
  }

  it('two concurrent completions each get their own model, tool_calls and finish_reason', async () => {
    fakeProviders();
    interleaveAtTrackUsage();
    const app = buildApp();
    const key = await makeKey();
    const send = (model) => request(app)
      .post('/openai/v1/chat/completions')
      .set('Authorization', `Bearer ${key}`)
      .send({ model, messages: [{ role: 'user', content: `hello ${model}` }] });

    const [ra, rb] = await Promise.all([send('groq/model-a'), send('cerebras/model-b')]);

    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect(ra.body.model).toBe('model-a');
    expect(ra.body.choices[0].finish_reason).toBe('tool_calls');
    expect(ra.body.choices[0].message.tool_calls?.[0]?.id).toBe('call_a');
    expect(ra.body.x_geeksuite?.provider).toBe('groq');

    expect(rb.body.model).toBe('model-b');
    expect(rb.body.choices[0].finish_reason).toBe('stop');
    expect(rb.body.choices[0].message.tool_calls).toBeUndefined();
    expect(rb.body.x_geeksuite?.provider).toBe('cerebras');
  });
});

describe('the shared field is gone', () => {
  it('callAI no longer writes lastProviderInfo onto the singleton', async () => {
    fakeProviders({ slowFirst: false });
    delete aiService.lastProviderInfo;
    await aiService.callAI('hi', { provider: 'cerebras', model: 'model-b' });
    expect(aiService.lastProviderInfo).toBeUndefined();
  });

  it('callAIWithInfo returns the call\'s own metadata', async () => {
    fakeProviders({ slowFirst: false });
    const { content, info } = await aiService.callAIWithInfo('hi', { provider: 'cerebras', model: 'model-b' });
    expect(content).toBe('answer from B');
    expect(info).toMatchObject({ provider: 'cerebras', model: 'model-b', finishReason: 'stop', cached: false });
  });
});
