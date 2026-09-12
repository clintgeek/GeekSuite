/**
 * aiFreeTierRouting.test.js — the free tier remembers which models are dead.
 *
 * The incident (2026-09-06, ~22:15): StartGeek's Ask routes through
 * `useAppConfig` with the app row `startgeek → tier: free`. Selection built its
 * candidate list from every `AIFreeTier` row with `isFree: true`, sorted it by
 * provider priority alone, and took the first — `groq/llama-3.1-8b-instant`, a
 * model Groq had retired (404 `model_not_found`). The call then fell into the
 * *generic* provider walk, which calls each remaining provider with its own
 * default model: cerebras 401, together 400, openrouter 404, cloudflare
 * eventually — well past the 3 s GlanceIntent budget. So the user got the
 * "read it as a search" fallback, and would again tomorrow, because nothing
 * remembered any of it.
 *
 * Four behaviours are pinned here, and one non-behaviour:
 *
 *   (a) a hard failure on the first free pick moves to the *next free
 *       candidate*, and cools the first;
 *   (b) a cooling row is not a candidate at all;
 *   (c) a `freeOnly` caller never reaches a paid provider default — this is the
 *       one that changed for the worse before it changed for the better: a
 *       free-tier caller could be answered, and billed, by a paid model;
 *   (d) a success clears the row's failure memory;
 *   (e) a non-free caller's walk is byte-for-byte the one it always had.
 *
 * Relationship to `aiDeadProviders.test.js`: that suite is about dead
 * *providers* — `llm7` and `onemin`, whole vendors struck from the roster in
 * `config/aiProviders.js`, asserted gone from every enum and table. This one is
 * about dead *models* inside providers that are very much alive. The two never
 * overlap: a retired provider has no `this.providers` entry, so no free-tier
 * row naming it can ever become a candidate here (the `pc && pc.apiKey` guard
 * in `selectFreeTierCandidates` is the same guard that made those rows inert).
 *
 * The provider layer is faked by patching `callProvider` — no HTTP, no keys.
 * Mongo is the shared in-memory instance from globalSetup.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

const { default: aiService } = await import('../services/aiService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');

/* ── patch/restore, the aiServiceCohereDispatch.test.js pattern ───────────── */

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}

/** An error shaped exactly the way the provider adapters rethrow one. */
function providerError(provider, status, body) {
  return new Error(`${provider} API error (${status}): ${JSON.stringify(body)}`);
}

/**
 * Stand in for every provider adapter. `answers` maps `<provider>/<model>` to
 * either an Error to throw or a string to return; anything unlisted throws, so
 * a call to a model the test did not name is a visible failure rather than a
 * silent pass.
 */
function fakeProviderLayer(answers) {
  const calls = [];
  patch(aiService, 'callProvider', async (provider, prompt, config = {}) => {
    const key = `${provider}/${config.model}`;
    calls.push(key);
    const answer = answers[key];
    if (answer === undefined) {
      throw new Error(`unexpected provider call: ${key}`);
    }
    if (answer instanceof Error) throw answer;
    return { content: answer, inputTokens: 1, outputTokens: 1, toolCalls: null, finishReason: 'stop' };
  });
  return calls;
}

/** Give a provider a key so its free rows become candidates. */
function enable(...providers) {
  for (const provider of providers) {
    const config = aiService.providers[provider];
    if (!config) throw new Error(`no such provider in the roster: ${provider}`);
    patch(config, 'apiKey', 'test-key-not-a-real-credential');
    patch(config, 'enabled', true);
  }
}

async function seedRows(rows) {
  await AIFreeTier.deleteMany({});
  await AIFreeTier.insertMany(rows.map(r => ({ isFree: true, ...r })));
}

const READY = { initialized: null };

/**
 * aiService is a module singleton, so its per-provider rate-limit buckets carry
 * over between cases in this file — and one of them deliberately provokes a
 * 429, which calls `markRateLimited('groq', 60)` and would silently remove groq
 * from every later case's walk. Wipe the buckets between tests.
 */
function resetRateLimits() {
  for (const bucket of Object.values(aiService.rateLimits)) {
    delete bucket.rateLimitedUntil;
    bucket.tokensUsed = 0;
    bucket.requestsUsed = 0;
    bucket.lastReset = Date.now();
    if (bucket.dailyRequestsUsed !== undefined) bucket.dailyRequestsUsed = 0;
    if (bucket.monthlyRequestsUsed !== undefined) bucket.monthlyRequestsUsed = 0;
    if (bucket.monthlyCreditsUsed !== undefined) bucket.monthlyCreditsUsed = 0;
  }
}

beforeEach(async () => {
  READY.initialized = aiService.initialized;
  aiService.initialized = true;
  aiService.freeTierHealth.clear();
  aiService.clearCache();
  resetRateLimits();
  await AIFreeTier.deleteMany({});
  await AIAppConfig.deleteMany({});
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
  await AIAppConfig.deleteMany({});
});

/* ── (a) a 404 on the first pick moves to the next free candidate ─────────── */

describe('a hard failure on the picked free model falls through to the next free row', () => {
  it('tries the next candidate, prefers a different provider, and cools the first', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'llama-3.1-8b-instant' },
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile' },
      { provider: 'cerebras', modelId: 'llama3.1-8b' },
    ]);

    const calls = fakeProviderLayer({
      'groq/llama-3.1-8b-instant': providerError('Groq', 404, { error: { code: 'model_not_found' } }),
      'cerebras/llama3.1-8b': 'the answer',
    });

    const answer = await aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' });

    expect(answer).toBe('the answer');
    // The retry crossed to a different provider rather than trying groq's
    // other row first — one vendor's retirement says nothing about another's.
    expect(calls).toEqual(['groq/llama-3.1-8b-instant', 'cerebras/llama3.1-8b']);

    const health = aiService.getFreeTierHealth('groq', 'llama-3.1-8b-instant');
    expect(health.consecutiveFailures).toBe(1);
    expect(health.lastFailureCode).toBe('http_404');
    expect(new Date(health.coolingUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('treats an empty answer from a free row as a failure: cools it and moves on', async () => {
    enable('cloudflare', 'ollama');
    await seedRows([
      { provider: 'cloudflare', modelId: '@cf/openai/gpt-oss-120b' },
      { provider: 'ollama', modelId: 'gpt-oss:20b' },
      { provider: 'cloudflare', modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
    ]);

    const calls = fakeProviderLayer({
      'cloudflare/@cf/openai/gpt-oss-120b': '   ',
      'ollama/gpt-oss:20b': 'pong',
    });

    const answer = await aiService.callAI('ping', { freeOnly: true, appName: 'startgeek' });

    expect(answer).toBe('pong');
    expect(calls).toEqual(['cloudflare/@cf/openai/gpt-oss-120b', 'ollama/gpt-oss:20b']);
    const health = aiService.getFreeTierHealth('cloudflare', '@cf/openai/gpt-oss-120b');
    expect(health.lastFailureCode).toBe('empty_content');
    expect(new Date(health.coolingUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('gives up after three free attempts rather than walking the whole collection', async () => {
    enable('groq', 'cerebras', 'together', 'cloudflare');
    await seedRows([
      { provider: 'groq', modelId: 'dead-a' },
      { provider: 'cerebras', modelId: 'dead-b' },
      { provider: 'together', modelId: 'dead-c' },
      { provider: 'cloudflare', modelId: 'would-have-worked' },
    ]);

    const calls = fakeProviderLayer({
      'groq/dead-a': providerError('Groq', 404, {}),
      'cerebras/dead-b': providerError('Cerebras', 401, {}),
      'together/dead-c': providerError('Together', 400, {}),
      'cloudflare/would-have-worked': 'never reached',
    });

    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' }))
      .rejects.toThrow(/Together API error \(400\)/);

    expect(calls).toHaveLength(3);
    expect(calls).not.toContain('cloudflare/would-have-worked');
  });

  it('leaves the row alone when the failure is soft', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'busy-model' },
      { provider: 'cerebras', modelId: 'llama3.1-8b' },
    ]);

    fakeProviderLayer({
      'groq/busy-model': providerError('Groq', 429, { error: 'rate limit' }),
      'cerebras/llama3.1-8b': 'ok',
    });

    await aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' });

    // A 429 is a bad minute, not a dead model. `markRateLimited` already owns
    // it; putting the row to sleep for six hours would be an overreaction.
    const health = aiService.getFreeTierHealth('groq', 'busy-model');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.coolingUntil).toBeNull();
  });

  it('escalates to a 24h cooldown on the third consecutive hard failure', async () => {
    enable('groq');
    const first = aiService.markFreeTierFailure('groq', 'gone', 'http_404');
    expect(Math.round((new Date(first.coolingUntil) - Date.now()) / 3600000)).toBe(6);
    aiService.markFreeTierFailure('groq', 'gone', 'http_404');
    const third = aiService.markFreeTierFailure('groq', 'gone', 'http_404');
    expect(third.consecutiveFailures).toBe(3);
    expect(Math.round((new Date(third.coolingUntil) - Date.now()) / 3600000)).toBe(24);
  });
});

/* ── (b) a cooling row is skipped at selection ────────────────────────────── */

describe('a cooling row is not a candidate', () => {
  it('skips it in favour of a live row, without calling it', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'sleeping', health: { coolingUntil: new Date(Date.now() + 60 * 60 * 1000), consecutiveFailures: 1, lastFailureCode: 'http_404' } },
      { provider: 'cerebras', modelId: 'awake' },
    ]);

    const calls = fakeProviderLayer({ 'cerebras/awake': 'ok' });
    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).resolves.toBe('ok');
    expect(calls).toEqual(['cerebras/awake']);
  });

  it('comes back once the cooling has expired', async () => {
    enable('groq');
    await seedRows([
      { provider: 'groq', modelId: 'woke', health: { coolingUntil: new Date(Date.now() - 1000), consecutiveFailures: 2 } },
    ]);

    const calls = fakeProviderLayer({ 'groq/woke': 'ok' });
    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).resolves.toBe('ok');
    expect(calls).toEqual(['groq/woke']);
  });

  it('tries the row closest to waking rather than answering nothing when every row is cooling', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'far', health: { coolingUntil: new Date(Date.now() + 20 * 60 * 60 * 1000) } },
      { provider: 'cerebras', modelId: 'near', health: { coolingUntil: new Date(Date.now() + 60 * 1000) } },
    ]);

    const calls = fakeProviderLayer({ 'cerebras/near': 'ok' });
    // A total free-tier outage because the probe marked a batch of rows dead
    // is worse than one long-shot attempt at whichever wakes soonest.
    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).resolves.toBe('ok');
    expect(calls).toEqual(['cerebras/near']);
  });

  it('prefers the most recently proven row within one provider tier', async () => {
    enable('groq');
    await seedRows([
      { provider: 'groq', modelId: 'never-tried' },
      { provider: 'groq', modelId: 'worked-an-hour-ago', health: { lastSuccessAt: new Date(Date.now() - 3600 * 1000) } },
    ]);

    const { live } = await aiService.selectFreeTierCandidates();
    expect(live.map(c => c.modelId)).toEqual(['worked-an-hour-ago', 'never-tried']);
  });
});

/* ── the human override (setCatalogOverride, 2026-09-11) ──────────────────── */

describe('a human override on a row', () => {
  it('deny takes a healthy row out of selection entirely', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'refused', override: 'deny' },
      { provider: 'cerebras', modelId: 'kept' },
    ]);

    const { live, cooling } = await aiService.selectFreeTierCandidates();
    // Not live and not merely cooling — the row is out of both lists.
    expect(live.map(c => c.modelId)).toEqual(['kept']);
    expect(cooling).toEqual([]);
  });

  it('deny still applies when it is the only row', async () => {
    enable('groq');
    await seedRows([{ provider: 'groq', modelId: 'refused', override: 'deny' }]);

    const { live, cooling } = await aiService.selectFreeTierCandidates();
    expect(live).toEqual([]);
    expect(cooling).toEqual([]);
  });

  it('allow keeps a cooling row a candidate', async () => {
    enable('groq');
    await seedRows([
      {
        provider: 'groq', modelId: 'insisted', override: 'allow',
        health: { coolingUntil: new Date(Date.now() + 60 * 60 * 1000), consecutiveFailures: 2 },
      },
    ]);

    const { live } = await aiService.selectFreeTierCandidates();
    expect(live.map(c => c.modelId)).toEqual(['insisted']);
  });

  it('allow does not override a live 0-remaining quota reading', async () => {
    enable('groq');
    await seedRows([
      {
        provider: 'groq', modelId: 'insisted', override: 'allow',
        observed: { remainingRequests: 0, resetAt: new Date(Date.now() + 60 * 1000), seenAt: new Date() },
      },
    ]);

    // `allow` sets aside the cooling memory, not the quota reading: a call to
    // a row the provider just said is empty would 429 anyway.
    const { live, cooling } = await aiService.selectFreeTierCandidates();
    expect(live).toEqual([]);
    expect(cooling.map(c => c.modelId)).toEqual(['insisted']);
  });

  it('a pin that names a denied row is refused as pin_denied', async () => {
    enable('groq');
    await seedRows([{ provider: 'groq', modelId: 'refused', override: 'deny' }]);

    await expect(aiService.pinIsUsable('groq', 'refused'))
      .resolves.toEqual({ ok: false, reason: 'pin_denied' });
  });

  it('a cleared override hands the row back to observed behavior', async () => {
    enable('groq');
    await seedRows([
      {
        provider: 'groq', modelId: 'pardoned', override: null,
        health: { coolingUntil: new Date(Date.now() + 60 * 60 * 1000) },
      },
    ]);

    const { live, cooling } = await aiService.selectFreeTierCandidates();
    expect(live).toEqual([]);
    expect(cooling.map(c => c.modelId)).toEqual(['pardoned']);
  });
});

/* ── (c) freeOnly never reaches a paid default model ──────────────────────── */

describe('a free-tier caller is never answered by a paid default model', () => {
  it('fails as itself when every free candidate has failed', async () => {
    enable('groq', 'cerebras', 'together');
    await seedRows([
      { provider: 'groq', modelId: 'dead-a' },
      { provider: 'cerebras', modelId: 'dead-b' },
    ]);

    // together has a key and sits in the fallback order but no free row, so the
    // OLD code would have called it with its own default model and returned an
    // answer. Until 2026-09-07 this stand-in was `anthropic`, whose default
    // model was genuinely paid — hence "billed to Chef". The mechanism under
    // test is the same: a provider with no free row is not consulted at all.
    const calls = fakeProviderLayer({
      'groq/dead-a': providerError('Groq', 404, {}),
      'cerebras/dead-b': providerError('Cerebras', 401, {}),
      [`together/${aiService.providers.together.model}`]: 'off the free path',
    });

    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead-a', 'cerebras/dead-b']);
  });

  it('fails as itself when there is no free row at all', async () => {
    enable('together');
    await seedRows([]);

    const calls = fakeProviderLayer({
      [`together/${aiService.providers.together.model}`]: 'off the free path',
    });

    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' }))
      .rejects.toThrow(/No free-tier model is available/);
    expect(calls).toEqual([]);
  });

  it('honours noFallback by taking exactly one free attempt', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'dead-a' },
      { provider: 'cerebras', modelId: 'alive' },
    ]);

    const calls = fakeProviderLayer({
      'groq/dead-a': providerError('Groq', 404, {}),
      'cerebras/alive': 'ok',
    });

    await expect(aiService.callAI('hello', { freeOnly: true, noFallback: true, appName: 'startgeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead-a']);
  });

  it('routes an app whose AIAppConfig row says tier: free down the same path', async () => {
    enable('groq', 'cerebras', 'together');
    await AIAppConfig.create({ appName: 'startgeek', tier: 'free' });
    await seedRows([
      { provider: 'groq', modelId: 'dead-a' },
      { provider: 'cerebras', modelId: 'alive' },
    ]);

    const calls = fakeProviderLayer({
      'groq/dead-a': providerError('Groq', 404, { error: { code: 'model_not_found' } }),
      'cerebras/alive': 'ok',
      [`together/${aiService.providers.together.model}`]: 'off the free path',
    });

    // This is the exact production shape: StartGeek Ask, useAppConfig, tier free.
    await expect(aiService.callAI('hello', { useAppConfig: true, appName: 'startgeek' })).resolves.toBe('ok');
    expect(calls).toEqual(['groq/dead-a', 'cerebras/alive']);
  });
});

/* ── (d) success resets health ────────────────────────────────────────────── */

describe('a success clears the row', () => {
  it('resets the counters in the mirror and in Mongo', async () => {
    enable('groq');
    await seedRows([
      { provider: 'groq', modelId: 'recovered', health: { consecutiveFailures: 2, lastFailureCode: 'http_500', lastFailureAt: new Date(Date.now() - 1000) } },
    ]);

    fakeProviderLayer({ 'groq/recovered': 'ok' });
    await expect(aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' })).resolves.toBe('ok');

    const health = aiService.getFreeTierHealth('groq', 'recovered');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastFailureCode).toBeNull();
    expect(health.coolingUntil).toBeNull();
    expect(health.lastSuccessAt).toBeInstanceOf(Date);

    // And it survives the process: the mirror is a mirror, not the record.
    await new Promise(resolve => setImmediate(resolve));
    const row = await AIFreeTier.findOne({ provider: 'groq', modelId: 'recovered' }).lean();
    expect(row.health.consecutiveFailures).toBe(0);
    expect(row.health.coolingUntil).toBeNull();
    expect(row.health.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('persists a hard failure to the row as well', async () => {
    enable('groq', 'cerebras');
    await seedRows([
      { provider: 'groq', modelId: 'retired' },
      { provider: 'cerebras', modelId: 'alive' },
    ]);

    fakeProviderLayer({
      'groq/retired': providerError('Groq', 404, {}),
      'cerebras/alive': 'ok',
    });
    await aiService.callAI('hello', { freeOnly: true, appName: 'startgeek' });
    await new Promise(resolve => setImmediate(resolve));

    const row = await AIFreeTier.findOne({ provider: 'groq', modelId: 'retired' }).lean();
    expect(row.health.consecutiveFailures).toBe(1);
    expect(row.health.lastFailureCode).toBe('http_404');
    expect(new Date(row.health.coolingUntil).getTime()).toBeGreaterThan(Date.now());
    // Never the provider's words — those carry org ids and key fragments.
    expect(row.health.lastFailureCode).not.toMatch(/\s/);
  });

  it('lets a document written by another process (the probe) override a stale mirror', async () => {
    aiService.markFreeTierSuccess('groq', 'buried');
    const probeWrote = {
      consecutiveFailures: 1,
      lastFailureAt: new Date(Date.now() + 1000),
      lastFailureCode: 'http_404',
      lastSuccessAt: null,
      coolingUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    };
    const merged = aiService.getFreeTierHealth('groq', 'buried', probeWrote);
    expect(merged.lastFailureCode).toBe('http_404');
    expect(merged.coolingUntil).toEqual(probeWrote.coolingUntil);
  });
});

/* ── (e) a caller that named nothing, and a caller that named a model ─────── */

describe('a caller that names nothing takes the same walk as a free-tier caller', () => {
  /**
   * CHANGED BY PHASE 2, deliberately, and this is the one case in this file
   * whose *behaviour* moved rather than being added to.
   *
   * It used to read "non-free callers walk exactly the list they always did"
   * and pinned the generic provider walk: the requested (or default) provider
   * followed by `fallbackOrder`, each called with *its own default model*.
   * That walk is what DOCS/AIGEEK_FRONT_DOOR.md §2 deletes — "this is now the
   * walk for every auto caller, not only freeOnly; the old provider default
   * model rotation is gone" — because it is the mechanism behind R130 and
   * F-22 both: a request that named no model was answered by whichever
   * vendor's default replied first, at 200, and billed to whoever asked.
   *
   * The rule the old case was really defending — "a caller that named nothing
   * still gets an answer" — survives, and is what is pinned below. What it no
   * longer gets is an answer from a model nobody asked for.
   */
  it('walks the health-ranked free rows, not every provider on its own default model', async () => {
    enable('groq', 'cerebras', 'together');
    await seedRows([
      { provider: 'groq', modelId: 'dead-row' },
      { provider: 'cerebras', modelId: 'a-free-row' },
    ]);

    const calls = fakeProviderLayer({
      'groq/dead-row': providerError('Groq', 404, {}),
      'cerebras/a-free-row': 'ok',
      // The provider defaults are listed so that a call to one is a visible
      // failure rather than a silent pass — nothing may reach them now.
      [`groq/${aiService.providers.groq.model}`]: 'off the free path',
      [`cerebras/${aiService.providers.cerebras.model}`]: 'off the free path',
      [`together/${aiService.providers.together.model}`]: 'off the free path',
    });

    // No provider, no model, no tier, no flags: the shape most in-process
    // callers use, and the one the old code sent down the generic walk.
    await expect(aiService.callAI('hello', { appName: 'geekpr' })).resolves.toBe('ok');
    expect(calls).toEqual(['groq/dead-row', 'cerebras/a-free-row']);
    // And the free rows were consulted, and marked — which is the point.
    expect(aiService.getFreeTierHealth('groq', 'dead-row').lastFailureCode).toBe('http_404');
  });

  it('fails as itself rather than reaching a provider default when there is no free row', async () => {
    enable('groq', 'cerebras', 'together');
    await seedRows([]);

    const calls = fakeProviderLayer({
      [`groq/${aiService.providers.groq.model}`]: 'off the free path',
      [`together/${aiService.providers.together.model}`]: 'off the free path',
    });

    await expect(aiService.callAI('hello', { appName: 'geekpr' }))
      .rejects.toThrow(/No free-tier model is available/);
    expect(calls).toEqual([]);
  });

  it('still honours an explicit model on the requested provider', async () => {
    enable('groq');
    const calls = fakeProviderLayer({ 'groq/a-model-i-named': 'ok' });
    await expect(aiService.callAI('hello', { provider: 'groq', model: 'a-model-i-named', noFallback: true }))
      .resolves.toBe('ok');
    expect(calls).toEqual(['groq/a-model-i-named']);
    expect(aiService.freeTierHealth.size).toBe(0);
  });
});

/* ── (f) Phase 2: the auto walk, the pin, sticky picks and the governor ────── */

/**
 * Everything below is Phase 2 (DOCS/AIGEEK_FRONT_DOOR.md). The free-tier state
 * machine above is unchanged — these cases pin what was built *on top of* it:
 * one route resolution, one walk for every auto caller, a pin that degrades
 * only when the catalog says so, sticky picks, and money behind a governor.
 */

const { default: AIStickyPick } = await import('../models/AIStickyPick.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AISpend } = await import('../models/AISpend.js');

async function clearPhase2() {
  await Promise.all([
    AIStickyPick.deleteMany({}),
    AIModel.deleteMany({}),
    AIPricing.deleteMany({}),
    AISpend.deleteMany({}),
  ]);
}

describe('the auto walk skips what cannot serve the request', () => {
  afterEach(clearPhase2);

  it('skips a tool-incapable provider\'s row and lets the next free row answer', async () => {
    // The walk half of the case openaiCompat.test.js used to carry: the
    // capability skip is unchanged, and under `auto` the next *free row* picks
    // it up rather than the next provider's default model.
    enable('cerebras', 'groq');
    await seedRows([
      { provider: 'cerebras', modelId: 'llama3.1-8b' },
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile' },
    ]);

    const calls = fakeProviderLayer({
      'groq/llama-3.3-70b-versatile': 'tools ok',
      'cerebras/llama3.1-8b': 'should never be called with tools',
    });

    const out = await aiService.callAI('weather?', {
      appName: 'geekpr',
      tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object', properties: {} } } }],
      messages: [{ role: 'user', content: 'weather?' }],
    });

    expect(out).toBe('tools ok');
    expect(calls).toEqual(['groq/llama-3.3-70b-versatile']);
  });
});

describe('a pin is a promise for callers that said so, and a preference otherwise', () => {
  afterEach(clearPhase2);

  it('degrades a cooling pin to the auto walk', async () => {
    enable('groq', 'cerebras');
    await AIAppConfig.create({ appName: 'geekpr', tier: 'specific', provider: 'groq', model: 'pinned-but-cooling' });
    await seedRows([
      { provider: 'groq', modelId: 'pinned-but-cooling', health: { coolingUntil: new Date(Date.now() + 3600 * 1000) } },
      { provider: 'cerebras', modelId: 'awake' },
    ]);

    const calls = fakeProviderLayer({ 'cerebras/awake': 'ok' });
    await expect(aiService.callAI('hello', { appName: 'geekpr' })).resolves.toBe('ok');
    expect(calls).toEqual(['cerebras/awake']);
    expect(aiService.lastProviderInfo.hints).toContain('pin_unavailable');
  });

  it('keeps a cooling pin when the caller said noFallback', async () => {
    enable('groq');
    await seedRows([
      { provider: 'groq', modelId: 'pinned-but-cooling', health: { coolingUntil: new Date(Date.now() + 3600 * 1000) } },
    ]);

    const calls = fakeProviderLayer({ 'groq/pinned-but-cooling': 'answered anyway' });
    // F-22: a caller that said noFallback asked to fail as itself. Turning
    // that into a different model's answer at 200 is the bug, not the fix.
    await expect(aiService.callAI('hello', {
      provider: 'groq', model: 'pinned-but-cooling', noFallback: true, appName: 'geekpr',
    })).resolves.toBe('answered anyway');
    expect(calls).toEqual(['groq/pinned-but-cooling']);
  });

  it('degrades a pin the provider\'s catalog does not list', async () => {
    enable('groq', 'cerebras');
    await AIModel.create({ provider: 'groq', modelId: 'a-model-groq-does-serve', name: 'a model groq does serve', isActive: true });
    await seedRows([{ provider: 'cerebras', modelId: 'awake' }]);

    const calls = fakeProviderLayer({ 'cerebras/awake': 'ok' });
    await expect(aiService.callAI('hello', {
      provider: 'groq', model: 'never-existed', appName: 'geekpr',
    })).resolves.toBe('ok');
    expect(calls).toEqual(['cerebras/awake']);
  });

  it('keeps a pin the catalog has no opinion about', async () => {
    // An empty catalog is not evidence against a caller's pin: the catalog is
    // observed and incomplete by construction, and refusing every unknown id
    // would turn a missed discovery run into a total outage.
    enable('groq');
    const calls = fakeProviderLayer({ 'groq/unknown-to-us': 'ok' });
    await expect(aiService.callAI('hello', {
      provider: 'groq', model: 'unknown-to-us', appName: 'geekpr',
    })).resolves.toBe('ok');
    expect(calls).toEqual(['groq/unknown-to-us']);
  });
});

describe('sticky picks keep one model per conversation', () => {
  afterEach(clearPhase2);

  it('records the pick on a sticky row and reuses it next turn', async () => {
    enable('groq', 'cerebras');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', sticky: 'per-conversation' });
    await seedRows([
      { provider: 'groq', modelId: 'the-gm', health: { lastSuccessAt: new Date() } },
      { provider: 'cerebras', modelId: 'someone-else', fitness: 'structured' },
    ]);

    const calls = fakeProviderLayer({ 'groq/the-gm': 'turn one', 'cerebras/someone-else': 'a different voice' });
    await aiService.callAI('go', { appName: 'storygeek', conversationId: 'story-1' });
    await new Promise(resolve => setImmediate(resolve));

    const pick = await AIStickyPick.findOne({ key: 'storygeek:story-1' }).lean();
    expect(pick).toMatchObject({ app: 'storygeek', conversationId: 'story-1' });
    expect(`${pick.provider}/${pick.modelId}`).toBe(calls[0]);

    // Turn two goes to the stored pick even though the ranking would now
    // prefer the `structured` cerebras row.
    aiService.clearCache();
    const secondCalls = fakeProviderLayer({ 'groq/the-gm': 'turn two', 'cerebras/someone-else': 'a different voice' });
    await expect(aiService.callAI('again', { appName: 'storygeek', conversationId: 'story-1' })).resolves.toBe('turn two');
    expect(secondCalls[0]).toBe('groq/the-gm');
  });

  it('re-picks when the stored pick dies, and files the old one in previous', async () => {
    enable('groq', 'cerebras');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', sticky: 'per-conversation' });
    await AIStickyPick.create({
      key: 'storygeek:story-2', app: 'storygeek', conversationId: 'story-2',
      provider: 'groq', modelId: 'retired-gm',
    });
    await seedRows([
      { provider: 'groq', modelId: 'retired-gm' },
      { provider: 'cerebras', modelId: 'the-new-gm' },
    ]);

    fakeProviderLayer({
      'groq/retired-gm': providerError('Groq', 404, { error: { code: 'model_not_found' } }),
      'cerebras/the-new-gm': 'the story continues',
    });

    await expect(aiService.callAI('go', { appName: 'storygeek', conversationId: 'story-2' }))
      .resolves.toBe('the story continues');
    await new Promise(resolve => setImmediate(resolve));

    const pick = await AIStickyPick.findOne({ key: 'storygeek:story-2' }).lean();
    expect(`${pick.provider}/${pick.modelId}`).toBe('cerebras/the-new-gm');
    // This is what Phase 3's needs-attention list reads.
    expect(pick.previous).toHaveLength(1);
    expect(pick.previous[0]).toMatchObject({ provider: 'groq', modelId: 'retired-gm', reason: 'http_404' });
  });

  it('is not sticky without a conversation id, however the row is configured', async () => {
    enable('groq');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', sticky: 'per-conversation' });
    await seedRows([{ provider: 'groq', modelId: 'one-shot' }]);

    fakeProviderLayer({ 'groq/one-shot': 'ok' });
    await aiService.callAI('go', { appName: 'storygeek' });
    await new Promise(resolve => setImmediate(resolve));
    expect(await AIStickyPick.countDocuments({})).toBe(0);
  });
});

describe('the paid fallback is behind allowPaid and the governor', () => {
  afterEach(clearPhase2);

  /** A paid-fallback row, priced per 1,000,000 tokens. */
  async function seedPaid({ inputPrice, outputPrice }) {
    await AIModel.create({ provider: 'openrouter', modelId: 'cheap-paid', name: 'Cheap Paid', isActive: true, role: 'paid-fallback' });
    await AIPricing.create({ provider: 'openrouter', modelId: 'cheap-paid', inputPrice, outputPrice });
  }

  it('never reaches a paid row when allowPaid is off', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'startgeek', tier: 'auto', allowPaid: false });
    await seedPaid({ inputPrice: 0.1, outputPrice: 0.1 });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'money was spent',
    });

    await expect(aiService.callAI('hi', { appName: 'startgeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead']);
  });

  it('reaches a paid row when allowPaid is on and the estimate fits both caps', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', allowPaid: true });
    // $0.10 per 1M tokens: a short prompt plus a 4,000-token ceiling is well
    // under the $0.01 per-call cap.
    await seedPaid({ inputPrice: 0.1, outputPrice: 0.1 });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'the paid answer',
    });

    await expect(aiService.callAI('hi', { appName: 'storygeek' })).resolves.toBe('the paid answer');
    expect(calls).toEqual(['groq/dead', 'openrouter/cheap-paid']);
  });

  it('skips the paid row when the per-call estimate is over the cap', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', allowPaid: true });
    // $500 per 1M output tokens × a 4,000-token ceiling = $2.00 a call.
    await seedPaid({ inputPrice: 500, outputPrice: 500 });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'money was spent',
    });

    await expect(aiService.callAI('hi', { appName: 'storygeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead']);
  });

  it('skips the paid row when today\'s ledger has already used the daily cap', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', allowPaid: true });
    await seedPaid({ inputPrice: 0.1, outputPrice: 0.1 });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);
    // The default per-day cap is $0.05.
    await AISpend.create({ day: new Date().toISOString().slice(0, 10), provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 1, costUsd: 0.05 });

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'money was spent',
    });

    await expect(aiService.callAI('hi', { appName: 'storygeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead']);
  });

  it('refuses an unpriced paid row rather than treating unknown as free', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', allowPaid: true });
    await AIModel.create({ provider: 'openrouter', modelId: 'cheap-paid', name: 'Cheap Paid', isActive: true, role: 'paid-fallback' });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'money was spent',
    });

    await expect(aiService.callAI('hi', { appName: 'storygeek' })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead']);
  });

  it('a free signal vetoes allowPaid, whatever the row says', async () => {
    enable('groq', 'openrouter');
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', allowPaid: true });
    await seedPaid({ inputPrice: 0.1, outputPrice: 0.1 });
    await seedRows([{ provider: 'groq', modelId: 'dead' }]);

    const calls = fakeProviderLayer({
      'groq/dead': providerError('Groq', 404, {}),
      'openrouter/cheap-paid': 'money was spent',
    });

    // A caller that asked for the free tier by name did not ask to be billed.
    await expect(aiService.callAI('hi', { appName: 'storygeek', freeOnly: true })).rejects.toThrow();
    expect(calls).toEqual(['groq/dead']);
  });
});
