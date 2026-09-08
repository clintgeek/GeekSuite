import { jest } from '@jest/globals';
import { runAIFeature, runFeatureCore, callsToday, parseJson, unwrapSchemaEnvelope, _resetCounters } from '../services/aiFeatureRunner.js';

const SCHEMA = { name: 'T', description: 't', schema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } };

function fakeAI(impl, info = { provider: 'groq', model: 'llama' }) {
  return { callAI: jest.fn(impl), lastProviderInfo: info };
}

beforeEach(() => _resetCounters());

describe('runAIFeature', () => {
  test('routes through the app routing row with the feature tag and parses JSON', async () => {
    const ai = fakeAI(async () => '```json\n{"a": 1}\n```');
    const r = await runAIFeature({ app: 'bujogeek', feature: 'review', userId: 'u1', system: 's', user: 'u', schema: SCHEMA, fallback: () => ({ a: 0 }), ai });
    expect(r.data).toEqual({ a: 1 });
    expect(r.provenance).toMatchObject({ source: 'model', provider: 'groq', model: 'llama', callsToday: 1 });
    const cfg = ai.callAI.mock.calls[0][1];
    // No routing switch: "nothing at all" is `auto` reading the app's routing
    // row (DOCS/AIGEEK_FRONT_DOOR.md §1), which is exactly what
    // `useAppConfig: true` used to mean here. The runner stopped saying it in
    // Phase 2 — `services/aiRoute.js` owns that vocabulary now — and the
    // routing it gets is identical.
    expect(cfg).toMatchObject({ appName: 'bujogeek', feature: 'review' });
    expect(cfg.useAppConfig).toBeUndefined();
    expect(cfg.responseFormat.type).toBe('json_schema');
  });

  test('cap: the (n+1)th call in a UTC day never reaches the model', async () => {
    const ai = fakeAI(async () => '{"a":1}');
    const base = { app: 'notegeek', feature: 'suggest', userId: 'u1', system: 's', user: 'u', schema: SCHEMA, fallback: () => ({ a: -1 }), maxCallsPerDay: 2, ai };
    await runAIFeature(base); await runAIFeature(base);
    const third = await runAIFeature(base);
    expect(third.provenance).toMatchObject({ source: 'fallback', reason: 'cap', callsToday: 2, cap: 2 });
    expect(third.data).toEqual({ a: -1 });
    expect(ai.callAI).toHaveBeenCalledTimes(2);
    // another user has their own counter
    const other = await runAIFeature({ ...base, userId: 'u2' });
    expect(other.provenance.source).toBe('model');
    // a new day resets it
    const tomorrow = await runAIFeature({ ...base, now: new Date(Date.now() + 86400000) });
    expect(tomorrow.provenance.source).toBe('model');
    expect(callsToday({ app: 'notegeek', feature: 'suggest', userId: 'u1' })).toBe(0); // swept
  });

  test('unavailable / timeout / unparseable / invalid all settle on the fallback', async () => {
    const fb = () => ({ a: 9 });
    const common = { app: 'x', feature: 'y', system: 's', user: 'u', schema: SCHEMA, fallback: fb };
    const down = await runAIFeature({ ...common, ai: fakeAI(async () => { throw new Error('ECONNREFUSED'); }) });
    expect(down.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
    const slow = await runAIFeature({ ...common, timeoutMs: 5, ai: fakeAI(() => new Promise(() => {})) });
    expect(slow.provenance.reason).toBe('unavailable');
    const junk = await runAIFeature({ ...common, ai: fakeAI(async () => 'not json at all') });
    expect(junk.provenance.reason).toBe('unparseable');
    const bad = await runAIFeature({ ...common, validate: (d) => d.a > 100, ai: fakeAI(async () => '{"a":1}') });
    expect(bad.provenance.reason).toBe('invalid');
    for (const r of [down, slow, junk, bad]) expect(r.data).toEqual({ a: 9 });
  });

  test('free text mode trims and treats empty as fallback', async () => {
    const ok = await runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u', fallback: () => 'fb', ai: fakeAI(async () => '  hello  ') });
    expect(ok.data).toBe('hello');
    const empty = await runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u', fallback: () => 'fb', ai: fakeAI(async () => '   ') });
    expect(empty).toMatchObject({ data: 'fb', provenance: { source: 'fallback', reason: 'empty' } });
  });

  test('a fallback is mandatory', async () => {
    await expect(runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u' })).rejects.toThrow(/fallback/);
  });

  test('parseJson tolerates prose around the object', () => {
    expect(parseJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(parseJson(null)).toBeNull();
  });

  test('a provider that wraps the JSON under the schema name is unwrapped (seen live on cloudflare)', async () => {
    const ai = fakeAI(async () => '{"T": {"a": 3}}');
    const r = await runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u', schema: SCHEMA, validate: (d) => d.a === 3, fallback: () => ({ a: 0 }), ai });
    expect(r.data).toEqual({ a: 3 });
    expect(r.provenance.source).toBe('model');
    expect(unwrapSchemaEnvelope({ T: 1 }, SCHEMA)).toEqual({ T: 1 });
    expect(unwrapSchemaEnvelope({ T: { a: 1 }, b: 2 }, SCHEMA)).toEqual({ T: { a: 1 }, b: 2 });
  });

  test('a feature never inherits the provider default token budget', async () => {
    const ai = fakeAI(async () => '{"a": 1}');
    await runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u', schema: SCHEMA, fallback: () => ({ a: 0 }), ai });
    expect(ai.callAI.mock.calls[0][1].maxTokens).toBe(600);
    await runAIFeature({ app: 'x', feature: 'y', system: 's', user: 'u', schema: SCHEMA, fallback: () => ({ a: 0 }), ai, maxTokens: 120 });
    expect(ai.callAI.mock.calls[1][1].maxTokens).toBe(120);
  });
});

/**
 * runFeatureCore — the half of the runner that `POST /api/ai/feature` serves.
 *
 * The wrapper's contract is pinned above and unchanged; these cases pin the
 * split itself: the core never calls `fallback` (it does not need one), a
 * refusal is `ok: false` with `source: 'none'` rather than `'fallback'`, and
 * the counter is the same counter — an HTTP feature call and an in-process one
 * for the same app/feature/user share one daily cap, because they are the same
 * feature.
 */
describe('runFeatureCore — the feature door over HTTP', () => {
  test('answers ok:true with provenance and never asks for a fallback', async () => {
    const ai = fakeAI(async () => '{"a": 4}', { provider: 'groq', model: 'llama', costUsd: 0, hints: ['app_config'] });
    const r = await runFeatureCore({ app: 'storygeek', feature: 'gm', userId: 'u1', system: 's', user: 'u', schema: SCHEMA, ai });
    expect(r).toMatchObject({ ok: true, data: { a: 4 }, reason: null });
    expect(r.provenance).toMatchObject({
      source: 'model', provider: 'groq', model: 'llama', callsToday: 1, costUsd: 0, hints: ['app_config'],
    });
  });

  test('a refusal is ok:false with source "none" — nothing fell back', async () => {
    const ai = fakeAI(async () => { throw new Error('ECONNREFUSED'); });
    const r = await runFeatureCore({ app: 'x', feature: 'y', system: 's', user: 'u', schema: SCHEMA, ai });
    expect(r).toMatchObject({ ok: false, data: null, reason: 'unavailable' });
    expect(r.provenance).toMatchObject({ source: 'none', reason: 'unavailable' });
  });

  test('the cap is the same bucket the in-process runner counts', async () => {
    const ai = fakeAI(async () => '{"a":1}');
    const base = { app: 'sharedcap', feature: 'f', userId: 'u1', system: 's', user: 'u', schema: SCHEMA, ai };
    await runFeatureCore({ ...base, maxCallsPerDay: 1 });
    // Same app:feature:user:day key, reached from the other function.
    const over = await runAIFeature({ ...base, maxCallsPerDay: 1, fallback: () => ({ a: -1 }) });
    expect(over.provenance).toMatchObject({ source: 'fallback', reason: 'cap', callsToday: 1, cap: 1 });
    expect(callsToday({ app: 'sharedcap', feature: 'f', userId: 'u1' })).toBe(1);
  });

  test('a whole messages array replaces the system/user pair, and the prompt is the last user turn', async () => {
    const ai = fakeAI(async () => 'hello');
    const messages = [
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'second' },
    ];
    const r = await runFeatureCore({ app: 'x', feature: 'y', messages, conversationId: 'story-7', ai });
    expect(r.ok).toBe(true);
    const [prompt, cfg] = ai.callAI.mock.calls[0];
    expect(prompt).toBe('second');
    expect(cfg.messages).toEqual(messages);
    // A conversation id is what turns a sticky routing row into a sticky pick.
    expect(cfg.conversationId).toBe('story-7');
  });

  test('a fallback is not required — that is the whole point of the split', async () => {
    const ai = fakeAI(async () => 'text');
    await expect(runFeatureCore({ app: 'x', feature: 'y', system: 's', user: 'u', ai })).resolves.toMatchObject({ ok: true });
    await expect(runFeatureCore({ feature: 'y', system: 's', user: 'u', ai })).rejects.toThrow(/app and feature/);
  });
});
