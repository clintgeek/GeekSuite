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

describe('vision — filters on the vendor\'s own modality claim, not a guess', () => {
  it('will not offer a row the listing never declared image-capable', () => {
    const rows = [row({ modelId: 'text-only', acceptsImageInput: false })];
    expect(resolveNeed(rows, 'vision:fast', { now: NOW })).toBeNull();
  });

  it('treats "the provider never said" the same as "no" — unlike everywhere else in this file', () => {
    // Every other axis lets an unmeasured row through mid-band so it can
    // eventually be measured. Vision does not: an image sent to a model that
    // cannot take one is a hard API error, not a quality risk worth finding
    // out about live.
    const rows = [row({ modelId: 'unknown-modality', acceptsImageInput: undefined })];
    expect(resolveNeed(rows, 'vision:fast', { now: NOW })).toBeNull();
    expect(scoreRow(rows[0], { task: 'vision', weight: 'fast' }, { now: NOW })).toBeNull();
  });

  it('picks the row the listing actually declared image-capable', () => {
    const rows = [
      row({ modelId: 'blind', acceptsImageInput: false }),
      row({ modelId: 'sighted', acceptsImageInput: true }),
    ];
    expect(resolveNeed(rows, 'vision:balanced', { now: NOW }).modelId).toBe('sighted');
  });

  it('does not require fitness: structured for a vision pick', () => {
    // Vision and structured are independent filters. A row that answers in
    // prose but declares image input is still a valid vision candidate.
    const rows = [row({ modelId: 'prose-but-sighted', fitness: 'basic', acceptsImageInput: true })];
    expect(resolveNeed(rows, 'vision:balanced', { now: NOW }).modelId).toBe('prose-but-sighted');
  });

  it('explains a vision pick by what the listing declared', () => {
    const picked = resolveNeed([row({ acceptsImageInput: true })], 'vision:balanced', { now: NOW });
    expect(picked.why[0]).toMatch(/accepts image input/);
  });

  it('still honours ordinary exclusions for a vision need', () => {
    const cooling = row({ modelId: 'cooling', acceptsImageInput: true, health: { coolingUntil: new Date(NOW + 60_000) } });
    expect(resolveNeed([cooling], 'vision:fast', { now: NOW })).toBeNull();
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

/**
 * Quality ranking — the fix for the tie-break that picked a bad model.
 *
 * Before the golden set, `fitness: 'structured'` was the only structured
 * signal, so on 2026-09-16 twenty-two rows scored identically, the tie fell to
 * last-success, and `groq/allam-2-7b` won work it had no business doing. These
 * cases pin the ordering that ends that.
 */
describe('resolveNeed ranks on measured quality', () => {
  const fresh = (score, byClass = {}) => ({
    score, byClass, offLanguage: false, answered: 6, scoredAt: new Date(NOW - 60_000)
  });

  it('prefers the better answer over the faster one', () => {
    // The whole point: a fast wrong answer is worth less than a slow right one.
    const rows = [
      row({ modelId: 'quick-and-wrong', latency: { p50Ms: 300 }, quality: fresh(0.2) }),
      row({ modelId: 'slower-and-right', latency: { p50Ms: 1800 }, quality: fresh(0.95) }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('slower-and-right');
  });

  it('still uses speed to break a tie between equals', () => {
    const rows = [
      row({ modelId: 'slow', latency: { p50Ms: 5000 }, quality: fresh(0.8) }),
      row({ modelId: 'quick', latency: { p50Ms: 400 }, quality: fresh(0.8) }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('quick');
  });

  it('still lets a specialist win inside its own class', () => {
    // Same overall, different strengths: each should win its own kind of work.
    const specialist = row({
      modelId: 'extractor', latency: { p50Ms: 900 },
      quality: fresh(0.6, { structured: 1, reasoning: 0.2 })
    });
    const thinker = row({
      modelId: 'thinker', latency: { p50Ms: 900 },
      quality: fresh(0.6, { structured: 0.3, reasoning: 1 })
    });
    const rows = [specialist, thinker];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('extractor');
    expect(resolveNeed(rows, 'reasoning:deep', { now: NOW }).modelId).toBe('thinker');
  });

  it('does not let one good class carry a model that is broken elsewhere', () => {
    // The live case, 2026-09-16. EVERY scored row came back structured=1 — a
    // row is only asked once `fitness` proved it emits JSON — so ranking on
    // that class alone is ranking on a constant, and allam-2-7b (overall 0.4,
    // numeracy 0, reasoning 0) reported "golden set 1 on structured" and kept
    // the work. A dish estimate is JSON *containing arithmetic*.
    const rows = [
      row({ modelId: 'allam-like', latency: { p50Ms: 317 }, quality: fresh(0.4, { structured: 1 }) }),
      row({ modelId: 'qwen-like', latency: { p50Ms: 196 }, quality: fresh(0.9, { structured: 1 }) }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('qwen-like');
  });

  it('keeps an unscored row selectable, so it can eventually be scored', () => {
    // Scoring "never asked" as zero would keep a new model out of selection
    // forever, so it could never be asked. It must beat a measured-bad row.
    const rows = [
      row({ modelId: 'measured-bad', latency: { p50Ms: 300 }, quality: fresh(0.1) }),
      row({ modelId: 'never-scored', latency: { p50Ms: 300 } }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('never-scored');
  });

  it('still prefers a measured-good row over an unscored one', () => {
    const rows = [
      row({ modelId: 'never-scored', latency: { p50Ms: 300 } }),
      row({ modelId: 'measured-good', latency: { p50Ms: 300 }, quality: fresh(0.9) }),
    ];
    expect(resolveNeed(rows, 'structured:fast', { now: NOW }).modelId).toBe('measured-good');
  });

  it('ignores a score too old to trust', () => {
    // Vendors swap what sits behind a slug without renaming it, so a score has
    // a shelf life. A stale good score must not outrank a fresh one.
    const stale = row({
      modelId: 'stale-good', latency: { p50Ms: 300 },
      quality: { score: 1, byClass: {}, answered: 6, scoredAt: new Date(NOW - 60 * 86400_000) }
    });
    const current = row({ modelId: 'fresh-ok', latency: { p50Ms: 300 }, quality: fresh(0.7) });
    expect(resolveNeed([stale, current], 'structured:fast', { now: NOW }).modelId).toBe('fresh-ok');
  });

  it('says what it measured, including when it has not', () => {
    const scored = resolveNeed([row({ quality: fresh(0.83, { structured: 0.83 }) })], 'structured:fast', { now: NOW });
    expect(scored.why.join(' ')).toMatch(/golden set 0\.83 \(overall 0\.83\)/);

    const unscored = resolveNeed([row()], 'structured:fast', { now: NOW });
    expect(unscored.why.join(' ')).toMatch(/golden set not run against this row yet/);
  });

  it('reads byClass whether it arrives as a Map or a plain object', () => {
    // Mongoose hands back a Map; a .lean() read and the tests hand back an object.
    const asMap = row({
      modelId: 'from-mongoose', latency: { p50Ms: 900 },
      quality: { ...fresh(0.5), byClass: new Map([['structured', 1]]) }
    });
    const asObject = row({ modelId: 'from-lean', latency: { p50Ms: 900 }, quality: fresh(0.5, { structured: 0.1 }) });
    expect(resolveNeed([asMap, asObject], 'structured:fast', { now: NOW }).modelId).toBe('from-mongoose');
  });
});
