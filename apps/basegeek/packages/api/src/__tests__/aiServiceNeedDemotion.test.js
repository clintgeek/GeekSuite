// aiService.resolveNeedCandidates puts a row that failed a need call in the
// last NEED_FAILURE_DEMOTE_MS at the back — demoted, not dropped (§7.10).
import { describe, test, expect } from '@jest/globals';

const mod = await import('../services/aiService.js');
const aiService = mod.default;
const { NEED_FAILURE_DEMOTE_MS, needDemoteMs, NEED_FAILURE_DEMOTE_MAX_MS } = mod;
const proto = Object.getPrototypeOf(aiService);

const row = (provider, modelId, score) => ({
  provider, modelId, isActive: true, isFree: true, freeTierLimits: {},
  capabilities: { text: true }, health: { status: 'alive' },
  quality: { score, tasks: { prose: score }, measuredAt: new Date() }, latency: { p50Ms: 900 },
});
const ROWS = [row('openrouter', 'best', 0.95), row('ollama', 'second', 0.8), row('gemini', 'third', 0.7)];

function fake() {
  return {
    recentNeedFailures: new Map(),
    selectFreeTierCandidates: async () => ({ live: ROWS, cooling: [] }),
    planFreeTierAttempts: proto.planFreeTierAttempts,
    noteNeedFailure: proto.noteNeedFailure,
    noteNeedSuccess: proto.noteNeedSuccess,
    resolveNeedCandidates: proto.resolveNeedCandidates,
  };
}
const order = async (svc, now) => (await svc.resolveNeedCandidates('prose:deep', { now })).map((p) => p.modelId);

describe('need demotion', () => {
  test('no failures: quality order', async () => {
    expect((await order(fake(), Date.now()))[0]).toBe('best');
  });

  test('a recent failure moves the row to the back, not out', async () => {
    const svc = fake();
    const now = Date.now();
    svc.noteNeedFailure('openrouter', 'best', now);
    const o = await order(svc, now + 1000);
    expect(o[0]).not.toBe('best');
    expect(o).toContain('best');
    expect(o.at(-1)).toBe('best');
  });

  test('after the demotion window, or a success, it leads again', async () => {
    const svc = fake();
    const now = Date.now();
    svc.noteNeedFailure('openrouter', 'best', now);
    expect((await order(svc, now + NEED_FAILURE_DEMOTE_MS + 1))[0]).toBe('best');
    svc.noteNeedFailure('openrouter', 'best', now);
    svc.noteNeedSuccess('openrouter', 'best');
    expect((await order(svc, now + 1000))[0]).toBe('best');
  });
});

describe('escalating demotion', () => {
  test('each further failure doubles the window, capped', () => {
    expect(needDemoteMs(1)).toBe(NEED_FAILURE_DEMOTE_MS);
    expect(needDemoteMs(2)).toBe(2 * NEED_FAILURE_DEMOTE_MS);
    expect(needDemoteMs(3)).toBe(4 * NEED_FAILURE_DEMOTE_MS);
    expect(needDemoteMs(50)).toBe(NEED_FAILURE_DEMOTE_MAX_MS);
  });

  test('a row that failed twice is still demoted past the first window', async () => {
    const svc = fake();
    const now = Date.now();
    svc.noteNeedFailure('openrouter', 'best', now - 1000);
    svc.noteNeedFailure('openrouter', 'best', now);
    // 15 minutes later: past one window (10), inside two (20).
    expect((await order(svc, now + 15 * 60_000)).at(-1)).toBe('best');
  });
});

