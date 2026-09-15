/**
 * A withdrawn model is retired, not cooled.
 *
 * The distinction this pins: a 401 or 403 means "this call was refused" — the
 * model still exists and the row should be cooled and retried. A 404 or 410
 * means the vendor deleted the slug, and no amount of waiting brings it back.
 * Cooling a retirement is just a slower way of failing forever.
 *
 * Why it exists: on 2026-09-15 three OpenRouter slugs in our catalog —
 * `google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.1-70b-instruct:free`
 * and `nousresearch/hermes-3-llama-3.1-405b:free` — were all 404-ing, with the
 * vendor replying "This model is unavailable for free. The paid version is
 * available now." Every pin to them fell back silently, all day, and nothing
 * in the system learned anything from it.
 *
 * The second half matters as much as the first: retirement is recorded
 * OUTSIDE the free-tier gate, because a paid or pinned model has no
 * `AIFreeTier` row and therefore had no failure memory of any kind.
 *
 * Conventions follow `aiFreeTierRouting.test.js`: provider layer faked by
 * patching `callProvider`, Mongo is the shared in-memory instance.
 *
 * The fixture ids are deliberately unlike any real model. `retireModel` writes
 * fire-and-forget, so an unawaited `isFree: false` can land after this file's
 * `afterEach` — and when these cases borrowed `llama-3.1-8b-instant` from the
 * routing suite, that late write flipped a row that suite had seeded and broke
 * it, but only in a full run.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

const { default: aiService } = await import('../services/aiService.js');
const { default: AIFreeTier, isRetirement } = await import('../models/AIFreeTier.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}

function providerError(provider, status, body) {
  return new Error(`${provider} API error (${status}): ${JSON.stringify(body)}`);
}

function fakeProviderLayer(answers) {
  const calls = [];
  patch(aiService, 'callProvider', async (provider, prompt, config = {}) => {
    const key = `${provider}/${config.model}`;
    calls.push(key);
    const answer = answers[key];
    if (answer === undefined) throw new Error(`unexpected provider call: ${key}`);
    if (answer instanceof Error) throw answer;
    return { content: answer, inputTokens: 1, outputTokens: 1, toolCalls: null, finishReason: 'stop' };
  });
  return calls;
}

function enable(...providers) {
  for (const provider of providers) {
    const config = aiService.providers[provider];
    if (!config) throw new Error(`no such provider in the roster: ${provider}`);
    patch(config, 'apiKey', 'test-key-not-a-real-credential');
    patch(config, 'enabled', true);
  }
}

const READY = { initialized: null };

/** The write is fire-and-forget, so give the microtask queue a turn. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(async () => {
  READY.initialized = aiService.initialized;
  aiService.initialized = true;
  await AIFreeTier.deleteMany({});
  await AIModel.deleteMany({});
  await AIAppConfig.deleteMany({});
  aiService.freeTierHealth.clear();
});

afterEach(async () => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
  aiService.initialized = READY.initialized;
  aiService.freeTierHealth.clear();
  aiService.clearCache();
});

afterAll(async () => {
  await AIFreeTier.deleteMany({});
  await AIModel.deleteMany({});
  await AIAppConfig.deleteMany({});
});

describe('isRetirement', () => {
  it.each(['http_404', 'http_410', 'model_not_found'])('%s means the model is gone', (code) => {
    expect(isRetirement(code)).toBe(true);
  });

  it.each(['http_401', 'http_403', 'http_400', 'rate_limited', 'timeout', 'network', 'unknown', 'empty_content'])(
    '%s does NOT mean the model is gone',
    (code) => {
      expect(isRetirement(code)).toBe(false);
    }
  );
});

describe('retireModel', () => {
  it('marks the catalog row inactive and records why', async () => {
    await AIModel.create({ provider: 'groq', modelId: 'retire-fixture-gone', name: 'Gone', isActive: true });

    aiService.retireModel('groq', 'retire-fixture-gone', 'http_404');
    await settle();

    const row = await AIModel.findOne({ provider: 'groq', modelId: 'retire-fixture-gone' }).lean();
    expect(row.isActive).toBe(false);
    expect(row.retiredReason).toBe('http_404');
    expect(row.retiredAt).toBeInstanceOf(Date);
  });

  it('stops a matching free row being picked', async () => {
    await AIFreeTier.create({ provider: 'groq', modelId: 'retire-fixture-gone', isFree: true });

    aiService.retireModel('groq', 'retire-fixture-gone', 'http_410');
    await settle();

    const row = await AIFreeTier.findOne({ provider: 'groq', modelId: 'retire-fixture-gone' }).lean();
    expect(row.isFree).toBe(false);
    expect(row.health.lastFailureCode).toBe('http_410');
  });

  it('is inert for a model nobody has heard of, and never throws', async () => {
    expect(() => aiService.retireModel('groq', 'retire-fixture-absent', 'http_404')).not.toThrow();
    expect(() => aiService.retireModel(null, null, 'http_404')).not.toThrow();
    await settle();
    expect(await AIModel.countDocuments({})).toBe(0);
  });
});

describe('a live 404 retires the model it was called on', () => {
  it('retires the row rather than only cooling it', async () => {
    enable('groq', 'cerebras');
    await AIModel.create({ provider: 'groq', modelId: 'retire-fixture-a', name: 'x', isActive: true });
    await AIFreeTier.insertMany([
      { provider: 'groq', modelId: 'retire-fixture-a', isFree: true },
      { provider: 'cerebras', modelId: 'retire-fixture-b', isFree: true }
    ]);

    fakeProviderLayer({
      'groq/retire-fixture-a': providerError('Groq', 404, { error: { code: 'model_not_found' } }),
      'cerebras/retire-fixture-b': 'the answer'
    });

    expect(await aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).toBe('the answer');
    await settle();

    const row = await AIModel.findOne({ provider: 'groq', modelId: 'retire-fixture-a' }).lean();
    expect(row.isActive).toBe(false);
    expect(row.retiredReason).toBe('http_404');
  });

  it('leaves a 403 alone — a refusal is not a withdrawal', async () => {
    enable('groq', 'cerebras');
    await AIModel.create({ provider: 'groq', modelId: 'retire-fixture-a', name: 'x', isActive: true });
    await AIFreeTier.insertMany([
      { provider: 'groq', modelId: 'retire-fixture-a', isFree: true },
      { provider: 'cerebras', modelId: 'retire-fixture-b', isFree: true }
    ]);

    fakeProviderLayer({
      'groq/retire-fixture-a': providerError('Groq', 403, { error: { message: 'forbidden' } }),
      'cerebras/retire-fixture-b': 'the answer'
    });

    await aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' });
    await settle();

    const row = await AIModel.findOne({ provider: 'groq', modelId: 'retire-fixture-a' }).lean();
    // Still active, but cooled — the model exists, this call was refused.
    expect(row.isActive).toBe(true);
    expect(row.retiredReason).toBeNull();
    expect(aiService.getFreeTierHealth('groq', 'retire-fixture-a').lastFailureCode).toBe('http_403');
  });

  it('retires a model that has NO free-tier row at all', async () => {
    // The gap that mattered: a paid or pinned model carries no AIFreeTier row,
    // so before this it had no failure memory of any kind and would 404 on
    // every call forever.
    enable('groq', 'cerebras');
    await AIModel.create({ provider: 'groq', modelId: 'retire-fixture-paid', name: 'x', isActive: true });
    await AIFreeTier.create({ provider: 'cerebras', modelId: 'retire-fixture-b', isFree: true });

    fakeProviderLayer({
      'groq/retire-fixture-paid': providerError('Groq', 404, { error: { code: 'model_not_found' } }),
      'cerebras/retire-fixture-b': 'the answer'
    });

    await aiService.callAI('hello', {
      appName: 'startgeek', provider: 'groq', model: 'retire-fixture-paid'
    }).catch(() => {});
    await settle();

    const row = await AIModel.findOne({ provider: 'groq', modelId: 'retire-fixture-paid' }).lean();
    expect(row.isActive).toBe(false);
    expect(row.retiredReason).toBe('http_404');
  });
});
