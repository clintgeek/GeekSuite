/**
 * aiHardeningDurableCaps.test.js — the per-feature daily cap survives a
 * restart and holds under concurrency (audit #13, Track D).
 *
 * The cap was an in-process `Map`: a push to main restarts the fleet, and
 * every restart handed every user a fresh day. And because the check and the
 * increment straddled an `await` (need resolution), N concurrent calls all
 * read "one left" and all went. Mongo is the shared in-memory instance.
 */

import { jest } from '@jest/globals';

const { runFeatureCore, callsToday, _resetCounters, _resetNeedCache, utcDay } = await import('../services/aiFeatureRunner.js');
const { default: AIFeatureQuota } = await import('../models/AIFeatureQuota.js');

function fakeAI({ delayMs = 0 } = {}) {
  return {
    callAI: jest.fn(async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return 'hello';
    }),
    // A need makes the runner await before it dispatches — the window the
    // old check-then-increment lost its race in.
    resolveNeedCandidates: jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [{ provider: 'groq', modelId: 'llama' }];
    }),
    lastProviderInfo: { provider: 'groq', model: 'llama' },
  };
}

const base = { app: 'capapp', feature: 'f', userId: 'u1', system: 's', user: 'u' };
const restores = [];

beforeAll(async () => {
  await AIFeatureQuota.db.asPromise();
}, 60000);

beforeEach(async () => {
  await _resetCounters();
  // Belt and braces: this file must not depend on _resetCounters to be clean.
  await AIFeatureQuota.deleteMany({ app: 'capapp' });
  _resetNeedCache();
});

afterEach(() => {
  while (restores.length) restores.pop()();
});

afterAll(async () => {
  await AIFeatureQuota.deleteMany({ app: 'capapp' });
});

describe('the daily cap is durable', () => {
  test('a counter already at the cap (left by a previous container) refuses', async () => {
    const day = utcDay();
    await AIFeatureQuota.create({ _id: `capapp:f:u1:${day}`, app: 'capapp', feature: 'f', bucket: 'u1', day, count: 2 });
    const ai = fakeAI();
    const r = await runFeatureCore({ ...base, maxCallsPerDay: 2, ai });
    expect(r).toMatchObject({ ok: false, reason: 'cap' });
    expect(r.provenance).toMatchObject({ callsToday: 2, cap: 2 });
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('each dispatched call is booked in the store', async () => {
    const ai = fakeAI();
    await runFeatureCore({ ...base, maxCallsPerDay: 5, ai });
    await runFeatureCore({ ...base, maxCallsPerDay: 5, ai });
    const doc = await AIFeatureQuota.findById(`capapp:f:u1:${utcDay()}`).lean();
    expect(doc?.count).toBe(2);
    expect(callsToday({ app: 'capapp', feature: 'f', userId: 'u1' })).toBe(2);
  });

  test('N concurrent calls cannot overshoot the cap', async () => {
    const ai = fakeAI({ delayMs: 5 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runFeatureCore({ ...base, need: 'prose:fast', maxCallsPerDay: 3, ai }))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => r.reason === 'cap')).toHaveLength(7);
    expect(ai.callAI).toHaveBeenCalledTimes(3);
  });
});

describe('claims that never dispatched are given back', () => {
  test('a requireNeed refusal does not spend the cap', async () => {
    const ai = fakeAI();
    ai.resolveNeedCandidates.mockResolvedValue([]);
    const r = await runFeatureCore({ ...base, need: 'vision:fast', requireNeed: true, maxCallsPerDay: 1, ai });
    expect(r).toMatchObject({ ok: false, reason: 'unavailable', detail: 'need_unresolved' });
    expect(r.provenance).toMatchObject({ callsToday: 0, cap: 1 });
    const doc = await AIFeatureQuota.findById(`capapp:f:u1:${utcDay()}`).lean();
    expect(doc?.count ?? 0).toBe(0);
    // And the one call the cap allows is still there.
    ai.resolveNeedCandidates.mockResolvedValue([{ provider: 'groq', modelId: 'llama' }]);
    _resetNeedCache();
    const ok = await runFeatureCore({ ...base, need: 'vision:fast', requireNeed: true, maxCallsPerDay: 1, ai });
    expect(ok.ok).toBe(true);
  });
});

describe('a store that cannot be written', () => {
  test('degrades to the in-process counter, still capped', async () => {
    const original = AIFeatureQuota.findOneAndUpdate;
    AIFeatureQuota.findOneAndUpdate = () => { throw new Error('mongo down'); };
    restores.push(() => { AIFeatureQuota.findOneAndUpdate = original; });

    const ai = fakeAI();
    const first = await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    const second = await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, reason: 'cap' });
    expect(ai.callAI).toHaveBeenCalledTimes(1);
  });
});

describe('_resetCounters', () => {
  test('clears the durable counters as well as the in-process ones', async () => {
    const ai = fakeAI();
    await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    await _resetCounters();
    const again = await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    expect(again.ok).toBe(true);
  });

  test('works un-awaited, as the older suites call it', async () => {
    const ai = fakeAI();
    await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    _resetCounters();
    const again = await runFeatureCore({ ...base, maxCallsPerDay: 1, ai });
    expect(again.ok).toBe(true);
  });
});
