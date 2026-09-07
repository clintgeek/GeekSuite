/**
 * aiQuotaAndSpend.test.js — the two things Phase 1 stopped declaring and
 * started observing: how much quota a row has left, and what a call cost.
 *
 * Before this (2026-09-07), both were hand-typed. Quotas lived in three
 * disagreeing tables (`aiService.rateLimits`, `rotationManager.PROVIDER_LIMITS`,
 * `aiDirectorService`'s free-tier seed — Groq's TPM read 6000, 12000 and 18000
 * depending on the file), and cost was one blended `costPer1kTokens` per
 * provider in a different unit from the `AIPricing` collection. Every number
 * asserted here now comes from a provider's own response.
 *
 * Mongo is the shared in-memory instance from globalSetup. No HTTP: the
 * provider layer is patched, the way `aiFreeTierRouting.test.js` does it.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import axios from 'axios';

const { default: aiService } = await import('../services/aiService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AISpend, spendDay } = await import('../models/AISpend.js');
const { default: RotationManager } = await import('../services/rotationManager.js');
const { FALLBACK_ORDER } = await import('../config/aiProviders.js');

/* ── patch/restore ────────────────────────────────────────────────────────── */

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * `updateStats` books the ledger fire-and-forget — that is the point of it, so
 * a user never waits on an accounting write. A test therefore has to wait for
 * the row rather than assume a tick is enough.
 */
async function eventually(read, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

beforeEach(async () => {
  // The unique index on (day, provider, app, feature) is what makes the
  // ledger's upsert an increment rather than a second row — and mongoose
  // builds indexes in the background, so a fresh in-memory collection has
  // none until asked. In production the index has existed since the first
  // boot; here it has to be waited for, or the concurrency case below tests
  // nothing.
  await AISpend.init();
  aiService.observedLimitWrites.clear();
  aiService.pricingCache.clear();
  for (const key of Object.keys(aiService.rateLimits)) delete aiService.rateLimits[key];
  await AIFreeTier.deleteMany({});
  await AIPricing.deleteMany({});
  await AISpend.deleteMany({});
});

afterEach(() => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
});

afterAll(async () => {
  await AIFreeTier.deleteMany({});
  await AIPricing.deleteMany({});
  await AISpend.deleteMany({});
});

/* ── rotationManager: in memory, and nothing on disk ─────────────────────── */

describe('RotationManager', () => {
  it('takes its order from config/aiProviders.js and keeps no copy of its own', () => {
    const rm = new RotationManager();
    expect(rm.getPriorityList()).toEqual(FALLBACK_ORDER);
    // A returned copy: a caller that splices the list (callAI does) must not
    // be able to reorder the rotation for everybody else.
    rm.getPriorityList().reverse();
    expect(rm.getPriorityList()).toEqual(FALLBACK_ORDER);
  });

  it('cools a provider for as long as asked and wakes it after', () => {
    const rm = new RotationManager({ order: ['groq', 'cerebras'] });
    const until = rm.markProviderCooling('groq', 60_000);
    expect(rm.isCooling('groq')).toBe(true);
    expect(rm.isCooling('cerebras')).toBe(false);
    expect(rm.isCooling('groq', until + 1)).toBe(false);
    // Reading it after it expired forgets it, so the map cannot grow forever.
    expect(rm.cooldowns.has('groq')).toBe(false);
  });

  it('selects the first provider that is not cooling', () => {
    const rm = new RotationManager({ order: ['groq', 'cerebras', 'together'] });
    expect(rm.selectProvider().provider).toBe('groq');
    rm.markProviderCooling('groq', 60_000);
    expect(rm.selectProvider().provider).toBe('cerebras');
  });

  it('returns the head with fallback:true when everything is cooling', () => {
    const rm = new RotationManager({ order: ['groq', 'cerebras'] });
    rm.markProviderCooling('groq', 60_000);
    rm.markProviderCooling('cerebras', 60_000);
    // Answering with a long shot beats answering nothing; the caller's own
    // walk moves on if it fails.
    expect(rm.selectProvider()).toEqual({ provider: 'groq', fallback: true });
  });

  it('has no file state and no usage counters left to persist', () => {
    const rm = new RotationManager();
    expect(rm.stateFilePath).toBeUndefined();
    expect(rm.persistState).toBeUndefined();
    expect(rm.recordUsage).toBeUndefined();
    expect(rm.updateRemaining).toBeUndefined();
    expect(rm.getState().cooling).toEqual({});
  });
});

/* ── quota learning ───────────────────────────────────────────────────────── */

describe('recordObservedLimits', () => {
  const HEADERS = {
    'x-ratelimit-limit-requests': '14400',
    'x-ratelimit-remaining-requests': '14370',
    'x-ratelimit-reset-requests': '2m59.56s',
    'x-ratelimit-limit-tokens': '18000',
    'x-ratelimit-remaining-tokens': '17997',
    'x-ratelimit-reset-tokens': '7.66s',
  };

  it('writes the ceilings to freeLimits and the live reading to observed', async () => {
    await AIFreeTier.create({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', isFree: true });
    aiService.recordObservedLimits('groq', 'llama-3.3-70b-versatile', HEADERS);

    const row = await eventually(async () => {
      const found = await AIFreeTier.findOne({ provider: 'groq', modelId: 'llama-3.3-70b-versatile' }).lean();
      return found?.observed?.seenAt ? found : null;
    });
    expect(row).toBeTruthy();
    // The numbers three files used to disagree about, from the provider itself.
    expect(row.freeLimits.requestsPerDay).toBe(14400);
    expect(row.freeLimits.tokensPerMinute).toBe(18000);
    expect(row.observed.remainingRequests).toBe(14370);
    expect(row.observed.remainingTokens).toBe(17997);
    expect(row.observed.resetAt).toBeInstanceOf(Date);
    expect(row.observed.seenAt).toBeInstanceOf(Date);
  });

  it('debounces to one write per row per minute', async () => {
    const at = Date.now();
    expect(aiService.recordObservedLimits('groq', 'm', HEADERS, at).wrote).toBe(true);
    expect(aiService.recordObservedLimits('groq', 'm', HEADERS, at + 30_000).wrote).toBe(false);
    expect(aiService.recordObservedLimits('groq', 'm', HEADERS, at + 61_000).wrote).toBe(true);
    // A different row is a different budget.
    expect(aiService.recordObservedLimits('groq', 'other', HEADERS, at + 1).wrote).toBe(true);
  });

  it('does nothing at all for a provider that sends no such headers', () => {
    // Gemini, Cloudflare, Cohere and Ollama Cloud send none.
    expect(aiService.recordObservedLimits('gemini', 'gemini-2.5-flash', { 'content-type': 'application/json' })).toBeNull();
    expect(aiService.recordObservedLimits('gemini', 'gemini-2.5-flash', undefined)).toBeNull();
    expect(aiService.recordObservedLimits('gemini', null, HEADERS)).toBeNull();
  });

  it('never creates a row for a model that has none', async () => {
    aiService.recordObservedLimits('groq', 'not-a-free-row', HEADERS);
    await flush();
    // A model is not made free by having been called.
    expect(await AIFreeTier.countDocuments({ modelId: 'not-a-free-row' })).toBe(0);
  });
});

describe('the 429 path honours retry-after', () => {
  it('reads the header off the error and cools for exactly that long', () => {
    const error = new Error('Groq API error (429): {}');
    error.response = { status: 429, headers: { 'retry-after': '17' } };
    expect(aiService.retryAfterFrom(error)).toBe(17);

    const at = Date.now();
    aiService.markRateLimited('groq', 17);
    expect(aiService.isRateLimited('groq')).toBe(true);
    expect(aiService.rateLimits.groq.rateLimitedUntil - at).toBeGreaterThanOrEqual(17_000);
    expect(aiService.isRateLimited('groq', at + 18_000)).toBe(false);
  });

  it('falls back to 60 s when the provider said nothing', () => {
    expect(aiService.retryAfterFrom(new Error('no response on this one'))).toBeNull();
    aiService.markRateLimited('cerebras');
    const until = aiService.rateLimits.cerebras.rateLimitedUntil;
    expect(until - Date.now()).toBeGreaterThan(55_000);
    expect(until - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('starts with no buckets at all — there is no table any more', () => {
    expect(aiService.rateLimits).toEqual({});
    expect(aiService.checkRateLimit).toBeUndefined();
    expect(aiService.updateRateLimitUsage).toBeUndefined();
  });
});

/* ── cost ─────────────────────────────────────────────────────────────────── */

describe('resolveCostUsd', () => {
  it('trusts the provider\'s own figure above everything', async () => {
    await AIPricing.create({ provider: 'openrouter', modelId: 'paid/x', inputPrice: 999, outputPrice: 999 });
    // OpenRouter's `usage.cost` is dollars, exact, for whichever model its
    // auto-router actually used — no table can beat that.
    expect(await aiService.resolveCostUsd('openrouter', 'paid/x', 1000, 1000, 0.00042)).toBe(0.00042);
    expect(await aiService.resolveCostUsd('openrouter', 'free/y', 1000, 1000, 0)).toBe(0);
  });

  it('prices from AIPricing per 1,000,000 tokens when the provider is silent', async () => {
    await AIPricing.create({ provider: 'groq', modelId: 'priced', inputPrice: 0.5, outputPrice: 1.5 });
    // 1M in at $0.50 + 2M out at $1.50 = 0.50 + 3.00
    expect(await aiService.resolveCostUsd('groq', 'priced', 1_000_000, 2_000_000, null)).toBeCloseTo(3.5, 9);
  });

  it('books zero for a model nobody has priced, and for no model at all', async () => {
    expect(await aiService.resolveCostUsd('groq', 'unpriced', 1_000_000, 1_000_000, null)).toBe(0);
    expect(await aiService.resolveCostUsd('groq', null, 1_000_000, 1_000_000, null)).toBe(0);
  });

  it('caches the price lookup rather than querying per call', async () => {
    await AIPricing.create({ provider: 'groq', modelId: 'cached', inputPrice: 1, outputPrice: 1 });
    await aiService.resolveCostUsd('groq', 'cached', 1_000_000, 0, null);
    let queries = 0;
    patch(AIPricing, 'findOne', (...args) => { queries++; return AIPricing.constructor.prototype.findOne.apply(AIPricing, args); });
    await aiService.resolveCostUsd('groq', 'cached', 1_000_000, 0, null);
    expect(queries).toBe(0);
  });
});

describe('the AISpend ledger', () => {
  it('books one $inc per call, keyed by UTC day / provider / app / feature', async () => {
    // Fired concurrently on purpose: two upserts racing to insert the same key
    // is the shape a busy minute takes, and the loser gets E11000. The ledger
    // has to add up anyway.
    await Promise.all([
      aiService.recordSpend('openrouter', 'startgeek', 'ask', 0.001),
      aiService.recordSpend('openrouter', 'startgeek', 'ask', 0.002),
      aiService.recordSpend('openrouter', 'startgeek', null, 0.5),
    ]);
    await flush();

    const ask = await AISpend.findOne({ provider: 'openrouter', app: 'startgeek', feature: 'ask' }).lean();
    expect(ask.calls).toBe(2);
    expect(ask.costUsd).toBeCloseTo(0.003, 9);
    expect(ask.day).toBe(spendDay());

    // A call with no feature is its own bucket, not a null hole in that one.
    const bare = await AISpend.findOne({ provider: 'openrouter', app: 'startgeek', feature: '' }).lean();
    expect(bare.calls).toBe(1);
  });

  it('books a free call as zero rather than not booking it', async () => {
    await aiService.recordSpend('groq', 'bujogeek', 'review', 0);
    const row = await AISpend.findOne({ provider: 'groq', app: 'bujogeek' }).lean();
    expect(row).toMatchObject({ calls: 1, costUsd: 0 });
  });

  it('updateStats resolves the cost, books it, and reports what it booked', async () => {
    await AIPricing.create({ provider: 'together', modelId: 'billed', inputPrice: 2, outputPrice: 4 });
    const out = await aiService.updateStats('together', 500_000, 250_000, 'billed', 'fitnessgeek', 'mealPlan');
    expect(out.costUsd).toBeCloseTo(1 + 1, 9);
    expect(out.isFreeUsage).toBe(false);
    const row = await eventually(() => AISpend.findOne({ provider: 'together', app: 'fitnessgeek', feature: 'mealplan' }).lean());
    expect(row).toBeTruthy();
    expect(row.costUsd).toBeCloseTo(2, 9);
  });

  it('updateStats prefers the reported figure over the price table', async () => {
    await AIPricing.create({ provider: 'openrouter', modelId: 'router', inputPrice: 100, outputPrice: 100 });
    const out = await aiService.updateStats('openrouter', 1000, 1000, 'router', 'startgeek', null, 0.000004);
    expect(out.costUsd).toBe(0.000004);
  });
});

/* ── selection ranks on what the probe measured ──────────────────────────── */

describe('selectFreeTierCandidates', () => {
  function enable(...providers) {
    for (const provider of providers) {
      patch(aiService.providers[provider], 'apiKey', 'test-key-not-a-real-credential');
      patch(aiService.providers[provider], 'enabled', true);
    }
  }

  beforeEach(() => { aiService.freeTierHealth.clear(); });

  it('puts structured above basic above never-probed, inside one provider', async () => {
    enable('groq');
    await AIFreeTier.insertMany([
      { provider: 'groq', modelId: 'never-probed', isFree: true },
      { provider: 'groq', modelId: 'talks', isFree: true, fitness: 'basic', probedAt: new Date() },
      { provider: 'groq', modelId: 'extracts', isFree: true, fitness: 'structured', probedAt: new Date() },
    ]);
    const { live } = await aiService.selectFreeTierCandidates();
    // Every AI feature in the suite asks for structured output. Nothing is
    // excluded for being small — it is ranked.
    expect(live.map(c => c.modelId)).toEqual(['extracts', 'talks', 'never-probed']);
  });

  it('ranks the auto-router first within its provider, whatever its fitness', async () => {
    enable('openrouter');
    await AIFreeTier.insertMany([
      { provider: 'openrouter', modelId: 'some/model:free', isFree: true, fitness: 'structured', probedAt: new Date() },
      { provider: 'openrouter', modelId: 'openrouter/free', isFree: true, fitness: 'basic', probedAt: new Date() },
    ]);
    const { live } = await aiService.selectFreeTierCandidates();
    expect(live.map(c => c.modelId)).toEqual(['openrouter/free', 'some/model:free']);
  });

  it('still prefers the most recently proven row when fitness ties', async () => {
    enable('groq');
    await AIFreeTier.insertMany([
      { provider: 'groq', modelId: 'never-tried', isFree: true, fitness: 'structured' },
      { provider: 'groq', modelId: 'worked-an-hour-ago', isFree: true, fitness: 'structured', health: { lastSuccessAt: new Date(Date.now() - 3600_000) } },
    ]);
    const { live } = await aiService.selectFreeTierCandidates();
    expect(live.map(c => c.modelId)).toEqual(['worked-an-hour-ago', 'never-tried']);
  });

  it('sets aside a row the provider said has nothing left until its reset', async () => {
    enable('groq');
    await AIFreeTier.insertMany([
      { provider: 'groq', modelId: 'exhausted', isFree: true, fitness: 'structured',
        observed: { remainingRequests: 0, resetAt: new Date(Date.now() + 3600_000) } },
      { provider: 'groq', modelId: 'has-room', isFree: true, fitness: 'basic',
        observed: { remainingRequests: 42, resetAt: new Date(Date.now() + 3600_000) } },
    ]);
    const { live, cooling } = await aiService.selectFreeTierCandidates();
    // Skipping this row is not a guess: the provider's own header said zero.
    expect(live.map(c => c.modelId)).toEqual(['has-room']);
    expect(cooling.map(c => c.modelId)).toEqual(['exhausted']);
    expect(cooling[0].exhausted).toBe(true);
  });

  it('lets an exhausted row back once its reset has passed', async () => {
    enable('groq');
    await AIFreeTier.create({
      provider: 'groq', modelId: 'refilled', isFree: true,
      observed: { remainingRequests: 0, resetAt: new Date(Date.now() - 1000) },
    });
    const { live } = await aiService.selectFreeTierCandidates();
    expect(live.map(c => c.modelId)).toEqual(['refilled']);
  });

  it('carries fitness, probedAt and observed onto the candidate', async () => {
    enable('groq');
    const probedAt = new Date();
    await AIFreeTier.create({ provider: 'groq', modelId: 'm', isFree: true, fitness: 'structured', probedAt, observed: { remainingRequests: 7 } });
    const { live } = await aiService.selectFreeTierCandidates();
    expect(live[0]).toMatchObject({ fitness: 'structured' });
    expect(live[0].probedAt.getTime()).toBe(probedAt.getTime());
    expect(live[0].observed.remainingRequests).toBe(7);
  });
});

/* ── every adapter hands the headers back ─────────────────────────────────── */

describe('the adapters return headers, and OpenRouter returns its cost', () => {
  const HEADERS = { 'x-ratelimit-remaining-requests': '5' };

  function stubPost(data, headers = HEADERS) {
    const calls = [];
    patch(axios, 'post', async (url, body, opts) => {
      calls.push({ url, body, opts });
      return { data, headers };
    });
    return calls;
  }

  it('groq, together, cerebras, llmgateway — the OpenAI-shaped four', async () => {
    const data = { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } };
    for (const [method, provider] of [['callGroq', 'groq'], ['callTogether', 'together'], ['callCerebras', 'cerebras'], ['callLLMGateway', 'llmgateway']]) {
      patch(aiService.providers[provider], 'apiKey', 'test-key-not-a-real-credential');
      stubPost(data);
      const out = await aiService[method]('hi', { model: 'm' });
      expect(out.headers).toEqual(HEADERS);
      while (patched.length && patched[patched.length - 1][1] === 'post') {
        const [obj, key, original, had] = patched.pop();
        if (had) obj[key] = original; else delete obj[key];
      }
    }
  });

  it('openrouter also asks for, and returns, the exact dollar cost', async () => {
    patch(aiService.providers.openrouter, 'apiKey', 'test-key-not-a-real-credential');
    const calls = stubPost({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.0000123 },
    });
    const out = await aiService.callOpenRouter('hi', { model: 'openrouter/free' });
    expect(calls[0].body.usage).toEqual({ include: true });
    expect(out.costUsd).toBe(0.0000123);
    expect(out.headers).toEqual(HEADERS);
  });

  it('openrouter reports null rather than zero when it said nothing', async () => {
    patch(aiService.providers.openrouter, 'apiKey', 'test-key-not-a-real-credential');
    stubPost({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
    const out = await aiService.callOpenRouter('hi', { model: 'm' });
    // null means "ask the price table", 0 would mean "this was free".
    expect(out.costUsd).toBeNull();
  });

  it('cloudflare, ollama, cohere and gemini too', async () => {
    patch(aiService.providers.cloudflare, 'apiKey', 'test-key-not-a-real-credential');
    patch(aiService.providers.cloudflare, 'accountId', 'acct');
    stubPost({ result: { response: 'hi' } });
    expect((await aiService.callCloudflare('hi', { model: 'm' })).headers).toEqual(HEADERS);
    patched.pop()[0];

    patch(aiService.providers.ollama, 'apiKey', 'test-key-not-a-real-credential');
    patch(axios, 'post', async () => ({ data: { message: { content: 'hi' } }, headers: HEADERS }));
    expect((await aiService.callOllama('hi', { model: 'm' })).headers).toEqual(HEADERS);

    patch(aiService.providers.cohere, 'apiKey', 'test-key-not-a-real-credential');
    patch(axios, 'post', async () => ({ data: { text: 'hi' }, headers: HEADERS }));
    expect((await aiService.callCohere('hi', { model: 'm' })).headers).toEqual(HEADERS);

    patch(aiService.providers.gemini, 'apiKey', 'test-key-not-a-real-credential');
    patch(axios, 'post', async () => ({ data: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] }, headers: HEADERS }));
    expect((await aiService.callGemini('hi', { model: 'm' })).headers).toEqual(HEADERS);
  });
});
