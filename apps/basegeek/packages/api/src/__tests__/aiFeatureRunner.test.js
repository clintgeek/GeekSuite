import { jest } from '@jest/globals';
import { runAIFeature, callsToday, parseJson, unwrapSchemaEnvelope, _resetCounters } from '../services/aiFeatureRunner.js';

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
    expect(cfg).toMatchObject({ useAppConfig: true, appName: 'bujogeek', feature: 'review' });
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
});
