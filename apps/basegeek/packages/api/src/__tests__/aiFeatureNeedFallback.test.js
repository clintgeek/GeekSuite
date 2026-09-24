// A need resolves to a short ranked list. When the best pick fails at the
// provider, the call falls to the next row that also meets the need — not to
// a row that doesn't, and not to failure (2026-09-24: every NoteGeek Compose
// failed for hours on one OpenRouter row whose upstream was out of capacity).
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { runAIFeature, _resetCounters, _resetNeedCache } from '../services/aiFeatureRunner.js';
import { rankNeed, resolveNeed } from '../services/aiNeedResolver.js';

const PICKS = [
  { provider: 'openrouter', modelId: 'vendor/big-model:free', why: ['best'] },
  { provider: 'groq', modelId: 'other-model', why: ['second'] },
];

function fakeAI(callImpl, picks = PICKS) {
  const ai = {
    resolveNeedCandidates: jest.fn(async () => picks),
    noteNeedFailure: jest.fn(),
    noteNeedSuccess: jest.fn(),
    callAI: jest.fn(async (prompt, cfg) => {
      const content = await callImpl(cfg);
      ai.lastProviderInfo = { provider: cfg.provider, model: cfg.model };
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

describe('need fallback', () => {
  test('best pick fails at the provider → the next pick answers, and provenance says so', async () => {
    const ai = fakeAI(async (cfg) => {
      if (cfg.provider === 'openrouter') throw new Error('Upstream error from Nvidia: ResourceExhausted');
      return 'a document';
    });
    const r = await run(ai);
    expect(r.data).toBe('a document');
    expect(r.provenance.source).toBe('model');
    expect(r.provenance.need).toMatchObject({ provider: 'groq', model: 'other-model', fellBackFrom: ['openrouter/vendor/big-model:free'] });
    expect(ai.callAI.mock.calls.map(([, cfg]) => cfg.provider)).toEqual(['openrouter', 'groq']);
  });

  test('best pick answers → one call, no fallback noted', async () => {
    const ai = fakeAI(async () => 'fine');
    const r = await run(ai);
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(r.provenance.need.fellBackFrom).toBeUndefined();
  });

  test('every pick fails → the feature\'s own fallback, after trying each once', async () => {
    const ai = fakeAI(async () => { throw new Error('502'); });
    const r = await run(ai);
    expect(r.data).toBe('FALLBACK');
    expect(r.provenance.source).toBe('fallback');
    expect(ai.callAI).toHaveBeenCalledTimes(2);
  });

  test('a SLOW failure (a timeout) is not retried — the caller must not wait twice', async () => {
    const ai = fakeAI(() => new Promise(() => {})); // never answers
    const r = await run(ai, { timeoutMs: 50 });
    expect(r.data).toBe('FALLBACK');
    expect(ai.callAI).toHaveBeenCalledTimes(1);
  });

  test('a caller\'s explicit pin is never second-guessed', async () => {
    const ai = fakeAI(async () => { throw new Error('502'); });
    await run(ai, { provider: 'groq', model: 'pinned' });
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(ai.resolveNeedCandidates).not.toHaveBeenCalled();
  });
});

describe('rankNeed', () => {
  test('orders every qualifying row best first; resolveNeed is its head', () => {
    const now = Date.now();
    const row = (modelId, score) => ({
      provider: 'p', modelId, isActive: true, isFree: true, freeTierLimits: {},
      capabilities: { text: true, structuredOutput: true }, health: { status: 'alive' },
      quality: { score, tasks: { prose: score }, measuredAt: new Date(now) }, latency: { p50Ms: 900 },
    });
    const rows = [row('b', 0.6), row('a', 0.9), row('c', 0.7)];
    const ranked = rankNeed(rows, 'prose:deep', { now });
    expect(ranked.length).toBeGreaterThan(0);
    expect(resolveNeed(rows, 'prose:deep', { now })?.modelId).toBe(ranked[0].modelId);
  });
});

describe('a row that fails is remembered (§7.10)', () => {
  test('a timeout notes the failure and drops the cached resolution, so the next call re-ranks', async () => {
    let calls = 0;
    const ai = fakeAI(async (cfg) => {
      calls += 1;
      if (calls === 1) return new Promise(() => {}); // the slow row times out
      return 'ok';
    });
    const first = await run(ai, { timeoutMs: 50 });
    expect(first.data).toBe('FALLBACK');
    expect(ai.noteNeedFailure).toHaveBeenCalledWith('openrouter', 'vendor/big-model:free');
    // Without the cache drop the second call would reuse the cached list for a minute.
    await run(ai, { timeoutMs: 50 });
    expect(ai.resolveNeedCandidates).toHaveBeenCalledTimes(2);
  });

  test('a success clears the row', async () => {
    const ai = fakeAI(async () => 'fine');
    await run(ai);
    expect(ai.noteNeedSuccess).toHaveBeenCalledWith('openrouter', 'vendor/big-model:free');
  });
});

