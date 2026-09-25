// Paid-first (2026-09-24): an app whose routing row names a paid model tries
// it FIRST, as a governed paid attempt, and the free rows only after it fails
// or the day's budget refuses it. NoteGeek and FitnessGeek, on OpenRouter
// credit. Three layers: the route, the attempt plan, the feature runner.
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { resolveRoute } from '../services/aiRoute.js';
import { runAIFeature, _resetCounters, _resetNeedCache } from '../services/aiFeatureRunner.js';
import AIPricing from '../models/AIPricing.js';

const mod = await import('../services/aiService.js');
const proto = Object.getPrototypeOf(mod.default);

const ROSTER = ['groq', 'gemini', 'openrouter', 'ollama'];
const ctx = { providerIds: ROSTER, appId: 'notegeek' };
const PAID_ROW = { tier: 'auto', allowPaid: true, paidFirst: true, paidProvider: 'openrouter', paidModel: 'vendor/cheap-paid' };

describe('resolveRoute — paid-first', () => {
  test('a row with allowPaid + paidFirst + a model names it on the auto route', () => {
    const r = resolveRoute({}, PAID_ROW, ctx);
    expect(r.mode).toBe('auto');
    expect(r.paidFirst).toEqual({ provider: 'openrouter', model: 'vendor/cheap-paid' });
    expect(r.paidOnly).toBe(false);
    expect(r.hints).toContain('paid_first');
  });

  test('paidFirst without allowPaid is nothing — allowPaid is still the permission', () => {
    expect(resolveRoute({}, { ...PAID_ROW, allowPaid: false }, ctx).paidFirst).toBeNull();
  });

  test('a free signal vetoes it, whatever the row says', () => {
    expect(resolveRoute({ freeOnly: true }, PAID_ROW, ctx).paidFirst).toBeNull();
  });

  test('half a model is no paid-first', () => {
    expect(resolveRoute({}, { ...PAID_ROW, paidModel: null }, ctx).paidFirst).toBeNull();
  });

  test('paidOnly passes through only alongside a paid-first model', () => {
    expect(resolveRoute({ paidOnly: true }, PAID_ROW, ctx).paidOnly).toBe(true);
    expect(resolveRoute({ paidOnly: true }, { tier: 'auto' }, ctx).paidOnly).toBe(false);
  });
});

describe('planAutoAttempts — paid-first', () => {
  const FREE = [{ provider: 'groq', modelId: 'free-a' }, { provider: 'gemini', modelId: 'free-b' }];
  const fake = () => ({
    selectFreeTierCandidates: async () => ({ live: FREE, cooling: [] }),
    planFreeTierAttempts: (chosen, limit) => chosen.slice(0, limit),
    selectPaidFallbackCandidates: async () => [],
  });
  const route = (extra = {}) => ({ mode: 'auto', allowPaid: true, singleAttempt: false, sticky: null, paidFirst: { provider: 'openrouter', model: 'vendor/cheap-paid' }, paidOnly: false, hints: [], ...extra });
  let spy;
  const priced = (row) => { spy = jest.spyOn(AIPricing, 'findOne').mockReturnValue({ lean: async () => row }); };
  afterEach(() => spy?.mockRestore());

  test('the paid model goes first, marked paid and priced so the governor sees it', async () => {
    priced({ inputPrice: 0.4, outputPrice: 1.6 });
    const { attempts, hints } = await proto.planAutoAttempts.call(fake(), route(), { appId: 'notegeek' });
    expect(attempts[0]).toMatchObject({ provider: 'openrouter', modelId: 'vendor/cheap-paid', paid: true, pricing: { inputPrice: 0.4, outputPrice: 1.6 } });
    expect(attempts.slice(1).map((a) => a.modelId)).toEqual(['free-a', 'free-b']);
    expect(hints).toContain('paid_first_planned');
  });

  test('paidOnly plans the paid attempt and nothing else', async () => {
    priced({ inputPrice: 0.4, outputPrice: 1.6 });
    const { attempts } = await proto.planAutoAttempts.call(fake(), route({ paidOnly: true }), { appId: 'notegeek' });
    expect(attempts.map((a) => a.modelId)).toEqual(['vendor/cheap-paid']);
  });

  test('an unpriced paid model is not attempted — the governor could not cap it', async () => {
    priced(null);
    const { attempts, hints } = await proto.planAutoAttempts.call(fake(), route(), { appId: 'notegeek' });
    expect(attempts.every((a) => !a.paid)).toBe(true);
    expect(hints).toContain('paid_first_unpriced');
  });
});

describe('runAIFeature — paid-first ahead of the need picks', () => {
  const PICKS = [{ provider: 'openrouter', modelId: 'free/big:free', why: [] }, { provider: 'groq', modelId: 'free-b', why: [] }];
  function fakeAI(callImpl, paidFirst = { provider: 'openrouter', model: 'vendor/cheap-paid' }) {
    const ai = {
      resolveNeedCandidates: jest.fn(async () => PICKS),
      paidFirstFor: jest.fn(async () => paidFirst),
      noteNeedFailure: jest.fn(),
      noteNeedSuccess: jest.fn(),
      callAI: jest.fn(async (prompt, cfg) => {
        const content = await callImpl(cfg);
        ai.lastProviderInfo = cfg.paidOnly ? { provider: 'openrouter', model: 'vendor/cheap-paid' } : { provider: cfg.provider, model: cfg.model };
        return content;
      }),
      lastProviderInfo: {},
    };
    return ai;
  }
  const run = (ai, extra = {}) => runAIFeature({
    app: 'notegeek', feature: 'compose_note', userId: 'u1', system: 's', user: 'u',
    need: 'prose:deep', fallback: () => 'FALLBACK', ai, timeoutMs: 2000, ...extra,
  });
  beforeEach(() => { _resetCounters(); _resetNeedCache(); });

  test('the first call is the paid-only auto call, not a free pin; one call when it answers', async () => {
    const ai = fakeAI(async () => 'a document');
    const r = await run(ai);
    expect(r.data).toBe('a document');
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    const cfg = ai.callAI.mock.calls[0][1];
    expect(cfg.paidOnly).toBe(true);
    expect(cfg.provider).toBeUndefined();
    expect(r.provenance.need).toMatchObject({ provider: 'openrouter', model: 'vendor/cheap-paid', paidFirst: true });
  });

  test('the paid call fails (budget refused, say) → the need\'s own picks, and no need row is blamed for it', async () => {
    const ai = fakeAI(async (cfg) => {
      if (cfg.paidOnly) throw new Error('All auto-mode attempts failed: paid budget refused');
      return 'free answer';
    });
    const r = await run(ai);
    expect(r.data).toBe('free answer');
    expect(ai.callAI.mock.calls.map(([, c]) => c.paidOnly ? 'paid' : c.model)).toEqual(['paid', 'free/big:free']);
    expect(r.provenance.need.fellBackFrom).toEqual(['paid:openrouter/vendor/cheap-paid']);
    expect(ai.noteNeedFailure).not.toHaveBeenCalled();
  });

  test('an app with no paid-first row is unchanged — the need\'s picks only', async () => {
    const ai = fakeAI(async () => 'ok', null);
    await run(ai);
    expect(ai.callAI.mock.calls[0][1]).toMatchObject({ provider: 'openrouter', model: 'free/big:free' });
    expect(ai.callAI.mock.calls[0][1].paidOnly).toBeUndefined();
  });

  test('a caller\'s explicit pin still wins over paid-first', async () => {
    const ai = fakeAI(async () => 'ok');
    await run(ai, { provider: 'groq', model: 'pinned' });
    expect(ai.paidFirstFor).not.toHaveBeenCalled();
    expect(ai.callAI.mock.calls[0][1]).toMatchObject({ provider: 'groq', model: 'pinned' });
  });
});
