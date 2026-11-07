/**
 * aiHardeningGovernor.test.js — the daily cap holds under concurrency.
 *
 * Until 2026-11-06 the governor was "read today's total, add the estimate,
 * compare with the cap" — and the spend was booked after the call returned,
 * fire-and-forget. N paid attempts arriving together all read the same total,
 * all passed, and the cap was a suggestion: eight concurrent $0.01 calls
 * against a $0.05 day spent $0.08.
 *
 * Now each paid attempt RESERVES its estimate before the provider is called,
 * with one conditional update on the day's budget document — two
 * reservations cannot both see room that only one of them fits — and the
 * reservation is reconciled to the real cost afterwards, or released when the
 * call fails. A ledger that cannot be written refuses the paid call.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';

const { default: mongoose } = await import('mongoose');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const AISpendModule = await import('../models/AISpend.js');
const { default: AISpend, spendDay } = AISpendModule;
const { paidCaps } = await import('../services/aiRoute.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const budgets = () => AISpend.db.collection('aispendbudgets');

let calls;
function fakeProviders({ fail = false, delayMs = 80, costUsd = 0.01 } = {}) {
  calls = [];
  patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
    calls.push(`${provider}/${config.model}`);
    await sleep(delayMs);
    if (fail) {
      const e = new Error('upstream 503');
      e.status = 503;
      throw e;
    }
    // OpenRouter prices its own call; the ledger books this verbatim.
    return { content: 'paid answer', inputTokens: 10, outputTokens: 10, finishReason: 'stop', headers: {}, costUsd };
  });
}

// $10 per 1M output tokens × a 1,000-token ceiling = exactly $0.01 a call;
// input is free so the prompt's size cannot move the estimate.
const PIN = { provider: 'openrouter', model: 'vendor/paid-model', maxTokens: 1000 };

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
  for (const bucket of Object.values(aiService.rateLimits)) delete bucket.rateLimitedUntil;
  patch(aiUsageService, 'trackUsage', async () => ({ success: true }));
  patch(aiService.providers.openrouter, 'apiKey', 'test-key-not-a-real-credential');
  patch(aiService.providers.openrouter, 'enabled', true);
  await Promise.all([
    AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}),
    AIPricing.deleteMany({}), AISpend.deleteMany({}), budgets().deleteMany({}),
  ]);
  await AISpend.init();
  await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
  await AIModel.create({ provider: 'openrouter', modelId: 'vendor/paid-model', name: 'Paid', isActive: true });
  await AIPricing.create({ provider: 'openrouter', modelId: 'vendor/paid-model', inputPrice: 0, outputPrice: 10 });
  paidCaps({ AI_PAID_PER_DAY_USD: '0.05', AI_PAID_PER_CALL_USD: '0.01' }, { reset: true });
});

afterEach(() => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
  paidCaps(process.env, { reset: true });
});

afterAll(async () => {
  await Promise.all([
    AIAppConfig.deleteMany({}), AIModel.deleteMany({}), AIPricing.deleteMany({}),
    AISpend.deleteMany({}), budgets().deleteMany({}),
  ]);
});

describe('the daily cap under concurrency', () => {
  it('eight concurrent $0.01 paid calls against a $0.05 day: exactly five are dispatched', async () => {
    fakeProviders();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => aiService.callAI(`question ${i}`, { appName: 'testgeek', ...PIN }))
    );
    expect(calls).toHaveLength(5);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);

    // Reconciled: nothing left reserved, and the day's real spend is booked.
    const doc = await budgets().findOne({ day: spendDay() });
    expect(doc.reservedUsd).toBeCloseTo(0, 9);
    expect(doc.settledUsd).toBeCloseTo(0.05, 9);
  });

  it('a failed paid call releases its reservation, so the next one fits', async () => {
    paidCaps({ AI_PAID_PER_DAY_USD: '0.01', AI_PAID_PER_CALL_USD: '0.01' }, { reset: true });
    fakeProviders({ fail: true });
    await expect(aiService.callAI('first', { appName: 'testgeek', ...PIN })).rejects.toThrow();
    const afterFailure = await budgets().findOne({ day: spendDay() });
    expect(afterFailure.reservedUsd).toBeCloseTo(0, 9);
    expect(afterFailure.settledUsd ?? 0).toBeCloseTo(0, 9);

    fakeProviders();
    await expect(aiService.callAI('second', { appName: 'testgeek', ...PIN })).resolves.toBe('paid answer');
    expect(calls).toHaveLength(1);
  });

  it('a reservation that cannot be written refuses the paid call (fail closed)', async () => {
    fakeProviders();
    const { AISpendBudget } = AISpendModule;
    expect(AISpendBudget).toBeDefined();
    patch(AISpendBudget, 'findOneAndUpdate', () => { throw new Error('mongo is down'); });
    await expect(aiService.callAI('hi', { appName: 'testgeek', ...PIN })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('spend booked outside the governor still counts against the day', async () => {
    fakeProviders();
    await AISpend.create({ day: spendDay(), provider: 'openrouter', app: 'othergeek', feature: 'x', calls: 1, costUsd: 0.045 });
    await expect(aiService.callAI('hi', { appName: 'testgeek', ...PIN })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
