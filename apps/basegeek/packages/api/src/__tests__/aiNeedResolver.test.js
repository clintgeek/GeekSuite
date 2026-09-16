/**
 * aiNeedResolver.test.js — routing on what was measured, not what was guessed.
 *
 * The cases here are mostly about restraint. It is easy to write a capability
 * router that reads `capabilities.performance.quality` and
 * `capabilities.tasks.reasoning` and looks authoritative; both fields are
 * string-matched off the model ID, and on 2026-09-15 they rated a retired 405B
 * slug state-of-the-art while the model that actually worked scored nothing.
 * So several tests below assert that a *worse-named, measured* row beats a
 * better-named one, and that the resolver says "no opinion" rather than
 * inventing a preference it has no data for.
 */
import { describe, it, expect } from '@jest/globals';

const {
  parseNeed, resolveNeed, scoreRow, exclusionFor, NEED_TASKS, NEED_WEIGHTS,
} = await import('../services/aiNeedResolver.js');

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const ago = (ms) => new Date(NOW - ms);

/** A healthy, alive, measured row. Overrides layer on top. */
const row = (over = {}) => ({
  provider: 'groq',
  modelId: 'a-model',
  isFree: true,
  fitness: 'structured',
  latency: { recentMs: [900], p50Ms: 900, measuredAt: ago(3600_000) },
  health: { coolingUntil: null, lastSuccessAt: ago(3600_000) },
  observed: {},
  ...over,
});

describe('parseNeed', () => {
  it('reads both axes', () => {
    expect(parseNeed('structured:fast')).toEqual({ task: 'structured', weight: 'fast' });
    expect(parseNeed('reasoning:deep')).toEqual({ task: 'reasoning', weight: 'deep' });
  });

  it('defaults the weight when only a task is named', () => {
    expect(parseNeed('structured')).toEqual({ task: 'structured', weight: 'balanced' });
  });

  it('is case and whitespace insensitive', () => {
    expect(parseNeed('  STRUCTURED:Fast ')).toEqual({ task: 'structured', weight: 'fast' });
  });

  it('refuses a typo rather than quietly treating it as no preference', () => {
    // 'strutured:fast' routed as "no opinion" would answer the call from some
    // reasonable model and hide the typo for months.
    expect(parseNeed('strutured:fast')).toBeNull();
    expect(parseNeed('structured:quick')).toBeNull();
    expect(parseNeed('structured:fast:extra')).toBeNull();
    expect(parseNeed('')).toBeNull();
    expect(parseNeed(null)).toBeNull();
    expect(parseNeed({ task: 'structured' })).toBeNull();
  });

  it('names the axes it accepts', () => {
    expect(NEED_TASKS).toContain('structured');
    expect(NEED_WEIGHTS).toEqual(['fast', 'balanced', 'deep']);
  });
});

describe('exclusionFor — every reason is measured or stated', () => {
  it('lets a healthy free row through', () => {
    expect(exclusionFor(row(), { now: NOW })).toBeNull();
  });

  it('excludes a cooling row', () => {
    const cooling = row({ health: { coolingUntil: new Date(NOW + 60_000) } });
    expect(exclusionFor(cooling, { now: NOW })).toBe('cooling');
  });

  it('stops cooling the moment the cooldown is past', () => {
    const cooled = row({ health: { coolingUntil: new Date(NOW - 1) } });
    expect(exclusionFor(cooled, { now: NOW })).toBeNull();
  });

  it('excludes a row we know is out of requests, not one we merely suspect', () => {
    const spent = row({ observed: { remainingRequests: 0, resetAt: new Date(NOW + 60_000) } });
    expect(exclusionFor(spent, { now: NOW })).toBe('rate_limited');
    // Past its reset, it is usable again.
    const reset = row({ observed: { remainingRequests: 0, resetAt: new Date(NOW - 1) } });
    expect(exclusionFor(reset, { now: NOW })).toBeNull();
    // A provider that sends no headers never populates this and is never excluded.
    expect(exclusionFor(row({ observed: {} }), { now: NOW })).toBeNull();
  });

  it('excludes a paid row unless the caller allows paid', () => {
    const paid = row({ isFree: false });
    expect(exclusionFor(paid, { now: NOW })).toBe('paid_not_allowed');
    expect(exclusionFor(paid, { now: NOW, allowPaid: true })).toBeNull();
  });

  it('honours a human deny', () => {
    expect(exclusionFor(row({ override: 'deny' }), { now: NOW })).toBe('denied');
  });
});

describe('resolveNeed — structured is the axis with a measurement behind it', () => {
  it('will not offer a row the probe could not get JSON out of', () => {
    const rows = [row({ modelId: 'text-only', fitness: 'basic' })];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW })).toBeNull();
  });

  it('prefers the measurably faster row for fast work', () => {
    const rows = [
      row({ modelId: 'slow', latency: { p50Ms: 9000 } }),
      row({ modelId: 'quick', latency: { p50Ms: 800 } }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('quick');
  });

  it('beats a grand-sounding name with a measured timing', () => {
    // The whole point. `performance.*` would rate the 405B row
    // state-of-the-art off its name alone; it is not read here at all.
    const rows = [
      row({
        modelId: 'nousresearch/hermes-3-llama-3.1-405b:free',
        latency: { p50Ms: 11000 },
        capabilities: { performance: { quality: 'state-of-the-art', speed: 'medium' } },
      }),
      row({
        modelId: 'allam-2-7b',
        latency: { p50Ms: 700 },
        capabilities: { performance: { quality: 'basic', speed: 'medium' } },
      }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('allam-2-7b');
  });

  it('keeps an unmeasured row in play for fast work', () => {
    // A row nobody has timed is not a slow row. If "unknown" scored as slow, a
    // newly discovered model could never be picked, so never timed, so never
    // stop being unknown.
    const rows = [
      row({ modelId: 'known-slow', latency: { p50Ms: 9000 } }),
      row({ modelId: 'never-timed', latency: {} }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('never-timed');
  });

  it('still prefers a measured fast row over an unmeasured one', () => {
    const rows = [
      row({ modelId: 'never-timed', latency: {} }),
      row({ modelId: 'measured-fast', latency: { p50Ms: 800 } }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('measured-fast');
  });

  it('does not penalise a slow row for deep work', () => {
    // "Slow is fine" means speed stops being a criterion, so the tie falls to
    // the row that answered most recently rather than to the quicker one.
    const rows = [
      row({ modelId: 'slow-but-recent', latency: { p50Ms: 11000 }, health: { lastSuccessAt: ago(60_000) } }),
      row({ modelId: 'quick-but-stale', latency: { p50Ms: 800 }, health: { lastSuccessAt: ago(30 * 86400_000) } }),
    ];
    expect(resolveNeed(rows, 'reasoning:deep', { now: NOW }).modelId).toBe('slow-but-recent');
  });

  it('says so when a task has no measured discriminator', () => {
    const picked = resolveNeed([row()], 'reasoning:deep', { now: NOW });
    expect(picked.why.join(' ')).toMatch(/no measured discriminator/);
  });

  it('explains a structured pick by what was measured', () => {
    const picked = resolveNeed([row({ latency: { p50Ms: 900 } })], 'structured:fast', { now: NOW });
    expect(picked.why[0]).toMatch(/probe extracted JSON/);
    expect(picked.why[1]).toMatch(/900ms \(fast\)/);
  });
});

describe('resolveNeed — no opinion is a real answer', () => {
  it('returns null when nothing can serve, rather than the least bad row', () => {
    const rows = [
      row({ modelId: 'cooling', health: { coolingUntil: new Date(NOW + 60_000) } }),
      row({ modelId: 'basic', fitness: 'basic' }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW })).toBeNull();
  });

  it('returns null for an unparseable need, leaving the caller on rotation', () => {
    expect(resolveNeed([row()], 'nonsense', { now: NOW })).toBeNull();
    expect(resolveNeed([row()], undefined, { now: NOW })).toBeNull();
  });

  it('survives an empty or missing catalog', () => {
    expect(resolveNeed([], 'structured:fast', { now: NOW })).toBeNull();
    expect(resolveNeed(null, 'structured:fast', { now: NOW })).toBeNull();
  });

  it('does not reach for a paid row unless allowed', () => {
    const rows = [row({ modelId: 'paid-good', isFree: false, latency: { p50Ms: 400 } })];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW })).toBeNull();
    expect(resolveNeed(rows, 'structured:fast', { now: NOW, allowPaid: true }).modelId).toBe('paid-good');
  });
});

describe('scoreRow ignores the fields that lie', () => {
  it('scores two rows identically when only performance.* differs', () => {
    const need = { task: 'structured', weight: 'fast' };
    const grand = row({ capabilities: { performance: { quality: 'state-of-the-art', reasoning: 'excellent' } } });
    const plain = row({ capabilities: { performance: { quality: 'basic', reasoning: 'basic' } } });
    expect(scoreRow(grand, need, { now: NOW }).score).toBe(scoreRow(plain, need, { now: NOW }).score);
  });

  it('scores two rows identically when only capabilities.tasks differs', () => {
    // tasks.* is true for nearly every model and false only for whisper and
    // guard names — a constant wearing a capability's name.
    const need = { task: 'reasoning', weight: 'deep' };
    const claims = row({ capabilities: { tasks: { reasoning: true, structuredOutput: true } } });
    const denies = row({ capabilities: { tasks: { reasoning: false, structuredOutput: false } } });
    expect(scoreRow(claims, need, { now: NOW }).score).toBe(scoreRow(denies, need, { now: NOW }).score);
  });
});
