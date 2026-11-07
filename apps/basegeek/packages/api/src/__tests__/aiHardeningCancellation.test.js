/**
 * aiHardeningCancellation.test.js — a call the caller gave up on stops.
 *
 * Until 2026-11-06 the feature runner's timeout was `Promise.race` and nothing
 * else: the caller got its `unavailable` at the deadline, and the call it had
 * abandoned kept walking in the background — the next free row, then the
 * governed PAID attempt, then the health writes, the sticky repin and the spend
 * booking, all for an answer nobody would read. The timeout now aborts a signal
 * that `callAI` checks before every attempt and hands to the adapter's HTTP
 * request.
 *
 * The real `aiService.callAI` and the real runner; only `callProvider` (and,
 * in the last case, the HTTP server an adapter talks to) is faked.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import http from 'node:http';

const { default: mongoose } = await import('mongoose');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AISpend } = await import('../models/AISpend.js');
const { default: AIStickyPick } = await import('../models/AIStickyPick.js');
const { runFeatureCore, _resetCounters } = await import('../services/aiFeatureRunner.js');
const openaiCompatible = await import('../services/ai/adapters/openaiCompatible.js');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An abort the way axios reports one. */
function canceled() {
  const e = new Error('canceled');
  e.code = 'ERR_CANCELED';
  e.name = 'CanceledError';
  return e;
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
  await Promise.all([
    AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}),
    AIPricing.deleteMany({}), AISpend.deleteMany({}), AIStickyPick.deleteMany({}),
  ]);
  // A row that may spend, sticky per conversation, two free rows and one
  // priced paid-fallback row: every kind of attempt the walk could reach.
  await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true, sticky: 'per-conversation', enabled: true });
  await AIFreeTier.insertMany([
    { provider: 'groq', modelId: 'slow', isFree: true },
    { provider: 'cerebras', modelId: 'second', isFree: true },
  ]);
  await AIModel.create({ provider: 'openrouter', modelId: 'paid/x', name: 'Paid X', isActive: true, role: 'paid-fallback' });
  await AIPricing.create({ provider: 'openrouter', modelId: 'paid/x', inputPrice: 0.1, outputPrice: 0.1 });
  enable('groq', 'cerebras', 'openrouter');
});

afterEach(async () => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
  aiService.clearCache();
  aiService.freeTierHealth.clear();
});

afterAll(async () => {
  await Promise.all([
    AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}),
    AIPricing.deleteMany({}), AISpend.deleteMany({}), AIStickyPick.deleteMany({}),
  ]);
});

jest.setTimeout(15000);

describe('the runner\'s timeout cancels the call it abandons', () => {
  it('a slow first attempt that fails after the deadline starts no second attempt and no paid one', async () => {
    const calls = [];
    const signals = [];
    patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
      calls.push(`${provider}/${config.model}`);
      signals.push(config.signal);
      // Fails softly (a 503) — after the caller's deadline, and regardless of
      // any signal, which is the worst case for a walk that does not check.
      await sleep(700);
      const e = new Error('upstream 503');
      e.status = 503;
      throw e;
    });

    // 300 ms: long enough that the first attempt is dispatched even on a cold
    // in-memory Mongo, short enough that it has not failed yet.
    const out = await runFeatureCore({ app: 'testgeek', feature: 'slow', user: 'hi', timeoutMs: 300 });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('unavailable');

    // Long enough for the old background walk to try every other row
    // (observed before the fix: groq/slow → cerebras/second → the PAID
    // openrouter/paid/x, all after the caller had its answer).
    await sleep(2500);
    expect(calls).toHaveLength(1);
    // The adapter was handed the signal, and the deadline fired it.
    expect(signals[0]).toBeDefined();
    expect(signals[0]?.aborted).toBe(true);
  });

  it('an answer that arrives after the deadline books no spend, no sticky pick and no health', async () => {
    const calls = [];
    patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
      calls.push(`${provider}/${config.model}`);
      await sleep(120); // ignores the signal — a provider that answers anyway
      return { content: 'late answer', inputTokens: 5, outputTokens: 5, finishReason: 'stop', headers: {} };
    });
    const spendWrites = [];
    const original = aiService.recordSpend.bind(aiService);
    patch(aiService, 'recordSpend', (...args) => { spendWrites.push(args); return original(...args); });

    const out = await runFeatureCore({ app: 'testgeek', feature: 'late', user: 'hi', timeoutMs: 40, conversationId: 'conv-1' });
    expect(out.ok).toBe(false);

    await sleep(1000);
    expect(calls).toHaveLength(1);
    expect(spendWrites).toEqual([]);
    expect(await AISpend.countDocuments({})).toBe(0);
    expect(await AIStickyPick.countDocuments({})).toBe(0);
    const [provider, modelId] = calls[0].split('/');
    const row = await AIFreeTier.findOne({ provider, modelId }).lean();
    expect(row.health?.lastSuccessAt ?? null).toBeNull();
    expect(aiService.freeTierHealth.get(aiService.freeTierKey(provider, modelId))?.lastSuccessAt ?? null).toBeNull();
  });

  it('a call whose signal is already aborted makes no provider call at all', async () => {
    const calls = [];
    patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
      calls.push(`${provider}/${config.model}`);
      return { content: 'x', inputTokens: 1, outputTokens: 1, headers: {} };
    });
    const ac = new AbortController();
    ac.abort();
    await expect(aiService.callAI('hi', { appName: 'testgeek', signal: ac.signal })).rejects.toThrow(/abort/i);
    expect(calls).toEqual([]);
  });

  it('a provider abort is not counted against the row\'s health', async () => {
    patch(aiService, 'callProvider', async (_provider, _prompt, config = {}) => {
      await new Promise((resolve, reject) => {
        config.signal?.addEventListener('abort', () => reject(canceled()));
        setTimeout(resolve, 2000);
      });
      return { content: 'never', inputTokens: 1, outputTokens: 1, headers: {} };
    });
    const ac = new AbortController();
    const pending = aiService.callAI('hi', { appName: 'testgeek', signal: ac.signal });
    setTimeout(() => ac.abort(), 30);
    await expect(pending).rejects.toThrow(/abort/i);
    for (const [provider, modelId] of [['groq', 'slow'], ['cerebras', 'second']]) {
      expect(aiService.isRateLimited(provider)).toBe(false);
      expect(aiService.freeTierHealth.get(aiService.freeTierKey(provider, modelId))?.consecutiveFailures ?? 0).toBe(0);
    }
  });
});

describe('the adapter hands the signal to its HTTP request', () => {
  it('openaiCompatible aborts an in-flight request when the signal fires', async () => {
    const server = http.createServer(() => { /* never answers */ });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const ac = new AbortController();
    const started = Date.now();
    setTimeout(() => ac.abort(), 50);
    try {
      await expect(openaiCompatible.call(
        { id: 'groq', apiKey: 'k', baseURL: `http://127.0.0.1:${port}`, model: 'm' },
        { prompt: 'hi', signal: ac.signal, timeoutMs: 5000 }
      )).rejects.toMatchObject({ code: 'aborted' });
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });
});
