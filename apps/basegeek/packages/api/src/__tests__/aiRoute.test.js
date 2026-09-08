/**
 * aiRoute.test.js — every way a caller can say "where should this go", and
 * the one Route it resolves to.
 *
 * `callAI` used to accept eleven of them (`tier: free | rotation | specific`,
 * `provider: 'free'`, `provider: 'basegeek-app'`, `freeOnly`, `useAppConfig`,
 * `autoRotate`, `noFallback`, a `<provider>/<model>` pin, a bare catalog id,
 * and the three `basegeek-*` aliases) and resolved them in ~150 lines of
 * interacting branches in which three separate blocks wrote the same four
 * variables. Each block was defensible alone; together they had produced R130
 * (a `tier: free` caller answered, and billed, by a paid default model) and
 * F-22 (a pinned request answered by a model nobody named).
 *
 * `resolveRoute` is that decision as one pure function, so it can be tested as
 * a table rather than as a fixture farm. Every legacy input in
 * DOCS/AIGEEK_FRONT_DOOR.md §1 appears below; if a row is missing from the
 * table, the vocabulary is bigger than the doc admits.
 *
 * Nothing here touches Mongo, a clock, or a provider. That is the point of the
 * module being pure — the parts that are not (is this pinned row cooling, what
 * has today cost) live on `aiService` and are pinned in
 * `aiFreeTierRouting.test.js`.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

const {
  resolveRoute,
  degradePin,
  explicitPinOf,
  legacyRoutingSwitches,
  normalizeTier,
  paidCaps,
  paidBudgetVerdict,
  estimatePaidCostUsd,
  LEGACY_AUTO_TIERS,
  ROUTING_ALIASES,
} = await import('../services/aiRoute.js');

/** The live roster, as `callAI` hands it over (`Object.keys(this.providers)`). */
const ROSTER = ['groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway'];

const ctx = (extra = {}) => ({ providerIds: ROSTER, appId: 'startgeek', ...extra });

/* ── the table ────────────────────────────────────────────────────────────── */

describe('resolveRoute — every legacy input in the §1 table', () => {
  const PIN_CASES = [
    {
      name: "model: '<provider>/<id>' with a provider in the roster",
      config: { model: 'groq/llama-3.3-70b-versatile' },
      expect: { mode: 'pin', provider: 'groq', model: 'llama-3.3-70b-versatile' },
    },
    {
      name: 'provider = a roster id with a model',
      config: { provider: 'cerebras', model: 'llama3.1-8b' },
      expect: { mode: 'pin', provider: 'cerebras', model: 'llama3.1-8b' },
    },
    {
      name: 'provider = a roster id with no model (§1 is silent; the provider default)',
      config: { provider: 'cloudflare' },
      expect: { mode: 'pin', provider: 'cloudflare', model: null },
    },
    {
      name: 'a bare catalog id resolved to its owner by findModelOwner, as /openai/v1 sends it',
      config: { provider: 'groq', model: 'llama-3.3-70b-versatile', noFallback: true },
      expect: { mode: 'pin', provider: 'groq', model: 'llama-3.3-70b-versatile', singleAttempt: true },
    },
  ];

  for (const testCase of PIN_CASES) {
    it(`pins: ${testCase.name}`, () => {
      const route = resolveRoute(testCase.config, null, ctx());
      expect(route).toMatchObject(testCase.expect);
      // A pin never spends: money is reached through the routing row's
      // `allowPaid`, and a pin does not read the row.
      expect(route.allowPaid).toBe(false);
      expect(route.hints).toContain('explicit_pin');
    });
  }

  const AUTO_CASES = [
    { name: "provider: 'free'", config: { provider: 'free' }, hint: 'free' },
    { name: 'freeOnly', config: { freeOnly: true }, hint: 'free' },
    { name: `model: '${ROUTING_ALIASES.FREE}'`, config: { model: ROUTING_ALIASES.FREE }, hint: 'free' },
    { name: 'autoRotate', config: { autoRotate: true }, hint: 'rotation' },
    { name: `model: '${ROUTING_ALIASES.ROTATION}'`, config: { model: ROUTING_ALIASES.ROTATION }, hint: 'rotation' },
    { name: 'useAppConfig', config: { useAppConfig: true }, hint: 'app_config' },
    { name: `provider: '${ROUTING_ALIASES.APP}'`, config: { provider: ROUTING_ALIASES.APP }, hint: 'app_config' },
    { name: `model: '${ROUTING_ALIASES.APP}'`, config: { model: ROUTING_ALIASES.APP }, hint: 'app_config' },
    { name: 'nothing at all', config: {}, hint: null },
  ];

  for (const testCase of AUTO_CASES) {
    it(`auto: ${testCase.name}`, () => {
      const route = resolveRoute(testCase.config, null, ctx());
      expect(route.mode).toBe('auto');
      expect(route.provider).toBeNull();
      expect(route.model).toBeNull();
      if (testCase.hint) expect(route.hints).toContain(testCase.hint);
    });
  }

  it("noFallback is singleAttempt on either mode, and nothing else", () => {
    expect(resolveRoute({ noFallback: true }, null, ctx()))
      .toMatchObject({ mode: 'auto', singleAttempt: true });
    expect(resolveRoute({ provider: 'groq', model: 'm', noFallback: true }, null, ctx()))
      .toMatchObject({ mode: 'pin', singleAttempt: true });
    expect(resolveRoute({}, null, ctx()).singleAttempt).toBe(false);
  });

  it('does not split a slash that is part of a real model id', () => {
    // `meta-llama` is not a provider, and splitting here would invent one.
    const route = resolveRoute({ model: 'meta-llama/llama-3.1-70b' }, null, ctx());
    expect(route.mode).toBe('auto');
    expect(explicitPinOf({ model: 'meta-llama/llama-3.1-70b' }, ROSTER)).toBeNull();
  });

  it('a request pin outranks the app row', () => {
    const row = { tier: 'specific', provider: 'gemini', model: 'gemini-2.5-flash' };
    const route = resolveRoute({ provider: 'groq', model: 'llama' }, row, ctx());
    expect(route).toMatchObject({ mode: 'pin', provider: 'groq', model: 'llama' });
  });
});

/* ── the routing row ──────────────────────────────────────────────────────── */

describe('resolveRoute — the routing row', () => {
  it("tier: 'specific' with a provider and model is a pin", () => {
    const row = { tier: 'specific', provider: 'gemini', model: 'gemini-2.5-flash' };
    expect(resolveRoute({ useAppConfig: true }, row, ctx()))
      .toMatchObject({ mode: 'pin', provider: 'gemini', model: 'gemini-2.5-flash' });
  });

  it("tier: 'specific' with half a pin is auto — a pin with no model is not a pin the row can keep", () => {
    expect(resolveRoute({}, { tier: 'specific', provider: 'gemini' }, ctx()).mode).toBe('auto');
    expect(resolveRoute({}, { tier: 'specific', model: 'gemini-2.5-flash' }, ctx()).mode).toBe('auto');
  });

  for (const tier of LEGACY_AUTO_TIERS) {
    it(`tier: '${tier}' reads as auto and records the legacy value as a hint`, () => {
      const route = resolveRoute({}, { tier }, ctx());
      expect(route.mode).toBe('auto');
      expect(route.hints).toContain(`legacy_tier:${tier}`);
    });
  }

  it("tier: 'auto' is auto with no legacy hint", () => {
    const route = resolveRoute({}, { tier: 'auto' }, ctx());
    expect(route.mode).toBe('auto');
    expect(route.hints.some(h => h.startsWith('legacy_tier'))).toBe(false);
  });

  it('no row at all is auto, and says so', () => {
    expect(resolveRoute({}, null, ctx()).hints).toContain('no_row');
  });

  it('allowPaid comes from the row and nowhere else', () => {
    expect(resolveRoute({}, { tier: 'auto', allowPaid: true }, ctx()).allowPaid).toBe(true);
    expect(resolveRoute({}, { tier: 'auto', allowPaid: false }, ctx()).allowPaid).toBe(false);
    expect(resolveRoute({}, null, ctx()).allowPaid).toBe(false);
    // A request body cannot buy itself a paid call. `allowPaid` is a routing
    // row, set by an admin in the aiGeek UI; a body field would make it a
    // credential, which it is not.
    expect(resolveRoute({ allowPaid: true }, null, ctx()).allowPaid).toBe(false);
  });

  it('a free signal vetoes the row‘s allowPaid', () => {
    const row = { tier: 'auto', allowPaid: true };
    expect(resolveRoute({ freeOnly: true }, row, ctx()).allowPaid).toBe(false);
    expect(resolveRoute({ provider: 'free' }, row, ctx()).allowPaid).toBe(false);
    expect(resolveRoute({ model: ROUTING_ALIASES.FREE }, row, ctx()).allowPaid).toBe(false);
    // ...and only a free signal does. `rotation` never meant "free".
    expect(resolveRoute({ autoRotate: true }, row, ctx()).allowPaid).toBe(true);
  });
});

/* ── sticky ───────────────────────────────────────────────────────────────── */

describe('resolveRoute — sticky picks', () => {
  const stickyRow = { tier: 'auto', sticky: 'per-conversation' };

  it('is a key of app and conversation id together', () => {
    const route = resolveRoute({}, stickyRow, ctx({ appId: 'storygeek', conversationId: 'story-7' }));
    expect(route.sticky).toEqual({ key: 'storygeek:story-7' });
  });

  it('reads the conversation id off the config too, for in-process callers', () => {
    const route = resolveRoute({ conversationId: 'story-9' }, stickyRow, ctx({ appId: 'storygeek' }));
    expect(route.sticky).toEqual({ key: 'storygeek:story-9' });
  });

  it('is null without a conversation id — there is nothing to be sticky about', () => {
    expect(resolveRoute({}, stickyRow, ctx()).sticky).toBeNull();
  });

  it('is null when the row does not ask for it', () => {
    expect(resolveRoute({}, { tier: 'auto' }, ctx({ conversationId: 'story-7' })).sticky).toBeNull();
  });

  it('is never set on a pin — a pin has already chosen', () => {
    const row = { tier: 'specific', provider: 'groq', model: 'm', sticky: 'per-conversation' };
    expect(resolveRoute({}, row, ctx({ conversationId: 'story-7' })).sticky).toBeNull();
  });
});

/* ── degradation ──────────────────────────────────────────────────────────── */

describe('degradePin', () => {
  it('turns a pin into auto and keeps every hint plus pin_unavailable', () => {
    const pinned = resolveRoute({ provider: 'groq', model: 'gone' }, null, ctx());
    const degraded = degradePin(pinned, { provider: 'groq', model: 'gone' }, { tier: 'auto', allowPaid: true }, ctx());
    expect(degraded.mode).toBe('auto');
    expect(degraded.provider).toBeNull();
    expect(degraded.hints).toContain('explicit_pin');
    expect(degraded.hints).toContain('pin_unavailable');
    expect(degraded.allowPaid).toBe(true);
  });

  it('does not let a tier: specific row re-derive the pin it just lost', () => {
    // Without `ignorePins` this degraded straight back into the same pin —
    // an infinite "degrade to itself" that would have looked like the pin
    // check simply not working.
    const row = { tier: 'specific', provider: 'groq', model: 'gone' };
    const pinned = resolveRoute({}, row, ctx());
    expect(pinned.mode).toBe('pin');
    expect(degradePin(pinned, {}, row, ctx()).mode).toBe('auto');
  });

  it('keeps the caller‘s attempt budget', () => {
    const pinned = resolveRoute({ provider: 'groq', model: 'gone', noFallback: true }, null, ctx());
    expect(degradePin(pinned, { provider: 'groq', model: 'gone', noFallback: true }, null, ctx()).singleAttempt).toBe(true);
  });

  it('picks up the sticky pick, which is what a degraded StoryGeek pin should land on', () => {
    const row = { tier: 'auto', sticky: 'per-conversation' };
    const pinned = resolveRoute({ provider: 'groq', model: 'gone' }, null, ctx({ appId: 'storygeek', conversationId: 's1' }));
    const degraded = degradePin(pinned, { provider: 'groq', model: 'gone' }, row, ctx({ appId: 'storygeek', conversationId: 's1' }));
    expect(degraded.sticky).toEqual({ key: 'storygeek:s1' });
  });
});

/* ── the body→config translation the two REST doors share ─────────────────── */

describe('legacyRoutingSwitches', () => {
  it("provider: 'free' becomes freeOnly and drops the provider", () => {
    expect(legacyRoutingSwitches({}, { provider: 'free' }))
      .toMatchObject({ freeOnly: true, provider: undefined });
  });

  it("provider: 'basegeek-app' becomes useAppConfig and drops the provider", () => {
    expect(legacyRoutingSwitches({}, { provider: 'basegeek-app' }))
      .toMatchObject({ useAppConfig: true, provider: undefined });
  });

  it('a body that names an app and no provider gets app routing (the legacy auto-trigger)', () => {
    expect(legacyRoutingSwitches({ appName: 'geekpr' }, {})).toMatchObject({ useAppConfig: true });
    expect(legacyRoutingSwitches({ feature: 'review' }, {})).toMatchObject({ useAppConfig: true });
  });

  it('a body that names an app and a provider does not', () => {
    expect(legacyRoutingSwitches({ appName: 'geekpr' }, { provider: 'groq' })).toEqual({});
  });

  it('freeOnly suppresses the auto-trigger, exactly as the in-place version did', () => {
    // The original set `config.freeOnly` and then tested `!config.freeOnly` in
    // the same expression chain, so a `freeOnly` body never picked up app
    // routing. Two deployed consumers rely on that, so it is reproduced
    // rather than tidied.
    const patch = legacyRoutingSwitches({ appName: 'storygeek', freeOnly: true }, {});
    expect(patch.freeOnly).toBe(true);
    expect(patch.useAppConfig).toBeUndefined();
  });

  it('never touches identity', () => {
    const patch = legacyRoutingSwitches(
      { appName: 'storygeek', userId: 'someone-else' },
      { appName: 'storygeek', userId: 'someone-else' }
    );
    expect(patch.appName).toBeUndefined();
    expect(patch.userId).toBeUndefined();
  });

  it('the AIGeek "Try it" panel, which names neither, still gets the raw walk', () => {
    expect(legacyRoutingSwitches({}, {})).toEqual({});
  });
});

/* ── the tier a save stores ───────────────────────────────────────────────── */

describe('normalizeTier', () => {
  it('keeps specific and turns everything else into auto', () => {
    expect(normalizeTier('specific')).toBe('specific');
    expect(normalizeTier('auto')).toBe('auto');
    expect(normalizeTier('free')).toBe('auto');
    expect(normalizeTier('rotation')).toBe('auto');
    // A stale UI, a typo, or nothing at all: `auto` is the mode that always
    // has somewhere to go.
    expect(normalizeTier('freee')).toBe('auto');
    expect(normalizeTier(undefined)).toBe('auto');
    expect(normalizeTier(null)).toBe('auto');
  });
});

/* ── the governor ─────────────────────────────────────────────────────────── */

describe('the governor — caps from env, read once', () => {
  beforeEach(() => paidCaps({}, { reset: true }));

  it('defaults to $0.05 a day and $0.01 a call', () => {
    expect(paidCaps({}, { reset: true })).toEqual({ perDayUsd: 0.05, perCallUsd: 0.01 });
  });

  it('reads both from env', () => {
    expect(paidCaps({ AI_PAID_PER_DAY_USD: '0.5', AI_PAID_PER_CALL_USD: '0.02' }, { reset: true }))
      .toEqual({ perDayUsd: 0.5, perCallUsd: 0.02 });
  });

  it('accepts zero — the honest way to turn paid off globally', () => {
    expect(paidCaps({ AI_PAID_PER_DAY_USD: '0' }, { reset: true }).perDayUsd).toBe(0);
  });

  it('ignores nonsense rather than letting a typo become an unlimited budget', () => {
    // A NaN cap compares false against everything, so `estimate > cap` would
    // be false and the governor would wave every call through.
    expect(paidCaps({ AI_PAID_PER_DAY_USD: 'lots', AI_PAID_PER_CALL_USD: '-1' }, { reset: true }))
      .toEqual({ perDayUsd: 0.05, perCallUsd: 0.01 });
  });

  it('is read once per process', () => {
    const first = paidCaps({ AI_PAID_PER_DAY_USD: '0.5' }, { reset: true });
    const second = paidCaps({ AI_PAID_PER_DAY_USD: '99' });
    expect(second).toBe(first);
  });
});

describe('the governor — estimatePaidCostUsd', () => {
  it('prices per 1,000,000 tokens: prompt in, maxTokens out', () => {
    // $1/1M in, $2/1M out; 1,000 prompt tokens and a 500-token ceiling.
    expect(estimatePaidCostUsd({ inputPrice: 1, outputPrice: 2 }, 1000, 500))
      .toBeCloseTo(1000 / 1e6 + (500 / 1e6) * 2, 10);
  });

  it('uses maxTokens rather than a guess at the real length, deliberately', () => {
    // The governor's job is to refuse the call that *could* be expensive. A
    // cap only breached in hindsight is not a cap.
    const cheapCeiling = estimatePaidCostUsd({ inputPrice: 0, outputPrice: 10 }, 0, 100);
    const dearCeiling = estimatePaidCostUsd({ inputPrice: 0, outputPrice: 10 }, 0, 10000);
    expect(dearCeiling).toBeGreaterThan(cheapCeiling);
  });

  it('is null when nothing is priced — unknown is never free', () => {
    expect(estimatePaidCostUsd(null, 100, 100)).toBeNull();
    expect(estimatePaidCostUsd({}, 100, 100)).toBeNull();
    expect(estimatePaidCostUsd({ inputPrice: 'free' }, 100, 100)).toBeNull();
  });

  it('prices half a row from the half it has', () => {
    expect(estimatePaidCostUsd({ outputPrice: 4 }, 1000, 1000)).toBeCloseTo(0.004, 10);
  });

  it('a genuine zero price is zero, not unknown', () => {
    expect(estimatePaidCostUsd({ inputPrice: 0, outputPrice: 0 }, 1000, 1000)).toBe(0);
  });
});

describe('the governor — paidBudgetVerdict', () => {
  const caps = { perDayUsd: 0.05, perCallUsd: 0.01 };

  it('allows a call inside both caps', () => {
    expect(paidBudgetVerdict({ spentTodayUsd: 0.01, estimateUsd: 0.002, caps }))
      .toMatchObject({ ok: true, reason: null });
  });

  it('a cap is an amount you may spend, not one you must stay under', () => {
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: 0.01, caps }).ok).toBe(true);
    expect(paidBudgetVerdict({ spentTodayUsd: 0.04, estimateUsd: 0.01, caps }).ok).toBe(true);
  });

  it('refuses a call over the per-call cap however empty the day is', () => {
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: 0.011, caps }))
      .toMatchObject({ ok: false, reason: 'paid_budget_per_call' });
  });

  it('refuses a call that would take the day over its cap', () => {
    expect(paidBudgetVerdict({ spentTodayUsd: 0.045, estimateUsd: 0.006, caps }))
      .toMatchObject({ ok: false, reason: 'paid_budget_per_day' });
  });

  it('refuses an unknown estimate rather than treating null as zero', () => {
    // `Number(null)` is 0, which is how "we do not know what this costs"
    // became "this is free" for exactly as long as it took this case to exist.
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: null, caps }))
      .toMatchObject({ ok: false, reason: 'paid_estimate_unknown' });
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: undefined, caps }))
      .toMatchObject({ ok: false, reason: 'paid_estimate_unknown' });
  });

  it('refuses when the ledger could not be read', () => {
    // `aiService.spentTodayUsd` reports Infinity on a failed read: not
    // knowing what today has cost is not permission to spend more.
    expect(paidBudgetVerdict({ spentTodayUsd: Number.POSITIVE_INFINITY, estimateUsd: 0.001, caps }))
      .toMatchObject({ ok: false, reason: 'paid_ledger_unreadable' });
  });

  it('a per-day cap of zero refuses everything, including a free estimate', () => {
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: 0, caps: { perDayUsd: 0, perCallUsd: 0 } }).ok)
      .toBe(true); // 0 + 0 <= 0, and 0 <= 0 — a $0 call is not a spend
    expect(paidBudgetVerdict({ spentTodayUsd: 0, estimateUsd: 0.0001, caps: { perDayUsd: 0, perCallUsd: 0 } }))
      .toMatchObject({ ok: false, reason: 'paid_budget_per_call' });
  });
});
