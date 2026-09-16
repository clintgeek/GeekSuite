/**
 * aiCatalogJob.test.js — the steward's scheduling, with an injected clock and
 * no network, no database and no waiting.
 *
 * The job is the point of Phase 1: it is what turns "Chef runs `docker exec …
 * discover-free-models.js --sync` monthly" into "the catalog is never more
 * than a day old". So the cases here are about *when* it runs and what happens
 * when a provider misbehaves, not about the discovery logic itself (that is
 * `aiDiscoverFreeModels.test.js`).
 *
 * Everything the job touches is injected: the clock, `aiService`, the discovery
 * module and the four collections. That is deliberate — a job whose schedule
 * can only be tested by waiting an hour is a job nobody tests.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { AICatalogJob, DEFAULT_TICK_MS, DEFAULT_DISCOVERY_HOURS, DEFAULT_PROBE_HOURS } =
  await import('../services/aiCatalogJob.js');

const HOUR = 60 * 60 * 1000;

/** A fake AICatalogRun collection: remembers what was written, answers findOne. */
function fakeRuns(seed = []) {
  const docs = [...seed];
  return {
    docs,
    create: async (doc) => { docs.push({ ...doc }); return doc; },
    findOne(filter) {
      const kind = filter?.kind;
      return {
        sort() { return this; },
        lean: async () => {
          // Honour the clean-run filter the job uses: `error: null` and
          // `counts.listedError`/`counts.probeError: null` match a missing
          // field or a null, the way Mongo does.
          const wantsClean = filter && 'error' in filter;
          const isClean = (d) => !wantsClean || (
            d.error == null && d.counts?.listedError == null && d.counts?.probeError == null
          );
          const matching = docs.filter(d => d.kind === kind && isClean(d));
          if (matching.length === 0) return null;
          return matching.reduce((a, b) =>
            new Date(b.startedAt).getTime() > new Date(a.startedAt).getTime() ? b : a);
        },
      };
    },
  };
}

function fakeCollection(rows = []) {
  const writes = [];
  return {
    writes,
    find: () => ({ lean: async () => rows }),
    updateOne: async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 1 }; },
    updateMany: async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 0 }; },
    deleteMany: async (filter) => { writes.push({ filter }); return { deletedCount: 0 }; },
  };
}

/** A discovery module stand-in that records what it was asked to do. */
function fakeDiscovery(overrides = {}) {
  const log = [];
  return {
    log,
    DEFAULT_PROBE_TIMEOUT_MS: 8000,
    safeErrorText: (t) => String(t).slice(0, 80),
    listModels: async () => ({ data: [] }),
    discover: async (args) => { log.push({ call: 'discover', providers: args.providers }); return []; },
    syncResults: async () => { log.push({ call: 'syncResults' }); return { alive: 1, dead: 0, unknown: 0, listed: 1, deactivated: 0 }; },
    summarizeByProvider: () => ({ groq: { listed: 1, candidates: 1, alive: 1, dead: 0, unknown: 0, error: null } }),
    pruneUnknownProviders: async () => { log.push({ call: 'prune' }); return { AIModel: 0, AIFreeTier: 0, AIPricing: 0 }; },
    runProbe: async ({ rows }) => { log.push({ call: 'runProbe', rows: rows.length }); return rows.map(r => ({ ...r, status: 'alive', fitness: 'basic', code: 'ok' })); },
    runGoldenSet: async ({ rows }) => { log.push({ call: 'runGoldenSet', rows: rows.length }); return []; },
    ...overrides,
  };
}

const silent = { info() {}, warn() {}, error() {}, debug() {} };

function makeJob({ at = Date.UTC(2026, 8, 7, 12, 0, 0), runs = fakeRuns(), discovery = fakeDiscovery(), freeRows = [], providers = { groq: { apiKey: 'k', enabled: true } }, ...rest } = {}) {
  const clock = { at };
  const job = new AICatalogJob({
    now: () => clock.at,
    deps: {
      ai: { providers, callProvider: async () => ({ content: 'ok' }) },
      discovery,
      catalogRun: runs,
      freeTier: fakeCollection(freeRows),
      model: fakeCollection(),
      pricing: fakeCollection(),
      providers: Object.keys(providers),
      log: silent,
    },
    ...rest,
  });
  return { job, clock, runs, discovery };
}

let savedEnv;
beforeEach(() => {
  savedEnv = { ...process.env };
  delete process.env.AI_CATALOG_JOB;
  delete process.env.AI_CATALOG_DISCOVERY_HOURS;
  delete process.env.AI_CATALOG_PROBE_HOURS;
  delete process.env.AI_CATALOG_GOLDEN_HOURS;
});
afterEach(() => { process.env = savedEnv; });

/* ── the schedule ─────────────────────────────────────────────────────────── */

describe('the defaults are the ones the brief promises', () => {
  it('ticks hourly, discovers at 24 h, re-probes at 6 h', () => {
    const { job } = makeJob();
    expect(DEFAULT_TICK_MS).toBe(HOUR);
    expect(DEFAULT_DISCOVERY_HOURS).toBe(24);
    expect(DEFAULT_PROBE_HOURS).toBe(6);
    expect(job.intervalMs).toBe(HOUR);
    expect(job.discoveryMs).toBe(24 * HOUR);
    expect(job.probeMs).toBe(6 * HOUR);
    expect(job.bootDelayMs).toBe(60 * 1000);
  });

  it('reads AI_CATALOG_DISCOVERY_HOURS and AI_CATALOG_PROBE_HOURS', () => {
    process.env.AI_CATALOG_DISCOVERY_HOURS = '2';
    process.env.AI_CATALOG_PROBE_HOURS = '0.5';
    const { job } = makeJob();
    expect(job.discoveryMs).toBe(2 * HOUR);
    expect(job.probeMs).toBe(0.5 * HOUR);
  });

  it('ignores a nonsense env value rather than disabling itself', () => {
    process.env.AI_CATALOG_DISCOVERY_HOURS = 'nightly';
    process.env.AI_CATALOG_PROBE_HOURS = '-3';
    const { job } = makeJob();
    expect(job.discoveryMs).toBe(24 * HOUR);
    expect(job.probeMs).toBe(6 * HOUR);
  });
});

describe('AI_CATALOG_JOB=off', () => {
  it('is the rollback: start() does nothing at all', () => {
    process.env.AI_CATALOG_JOB = 'off';
    const { job } = makeJob();
    job.start();
    expect(job.isRunning).toBe(false);
    expect(job.jobInterval).toBeNull();
    expect(job.bootTimer).toBeNull();
    job.stop();
  });

  it('any other value leaves it on', () => {
    process.env.AI_CATALOG_JOB = 'on';
    const { job } = makeJob();
    job.start();
    expect(job.isRunning).toBe(true);
    job.stop();
    expect(job.isRunning).toBe(false);
  });
});

describe('start/stop', () => {
  it('arms a boot timer and an interval, and clears both on stop', () => {
    const { job } = makeJob();
    job.start();
    expect(job.bootTimer).not.toBeNull();
    expect(job.jobInterval).not.toBeNull();
    job.stop();
    expect(job.bootTimer).toBeNull();
    expect(job.jobInterval).toBeNull();
  });

  it('refuses to start twice', () => {
    const { job } = makeJob();
    job.start();
    const first = job.jobInterval;
    job.start();
    expect(job.jobInterval).toBe(first);
    job.stop();
  });
});

/* ── what a tick decides ──────────────────────────────────────────────────── */

describe('tick', () => {
  it('runs discovery when there has never been one', async () => {
    const { job, discovery } = makeJob();
    const out = await job.tick();
    expect(out.discovery).toBeTruthy();
    // `runGoldenSet` joined the tick 2026-09-16, behind its own daily gate.
    expect(discovery.log.map(l => l.call)).toEqual(['discover', 'syncResults', 'prune', 'runGoldenSet']);
  });

  it('does not re-run discovery an hour later', async () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([
      { kind: 'discovery', startedAt: new Date(now - HOUR), finishedAt: new Date(now - HOUR) },
      { kind: 'probe', startedAt: new Date(now - HOUR), finishedAt: new Date(now - HOUR) },
    ]);
    const { job, discovery } = makeJob({ at: now, runs });
    const out = await job.tick();
    expect(out.discovery).toBeNull();
    expect(out.probe).toBeNull();
    // Scoped to what this case is about. The golden set runs on its own daily
    // gate and has its own cases; a bare `toEqual([])` here silently made this
    // a test of every step the tick would ever grow.
    expect(discovery.log.filter(l => l.call !== 'runGoldenSet')).toEqual([]);
  });

  it('re-runs discovery when the last run an hour ago completed with write errors', async () => {
    // 2026-09-07 live: every AIModel upsert threw on a `name` path conflict,
    // the run still got a document, and the 24 h gate would have held the
    // broken catalog for a day. A run with error text is not a run.
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([{
      kind: 'discovery', startedAt: new Date(now - HOUR), finishedAt: new Date(now - HOUR),
      error: null, counts: { alive: 0, listedError: "Updating the path 'name' would create a conflict at 'name'" },
    }]);
    const { job, discovery } = makeJob({ at: now, runs });
    await job.tick();
    expect(discovery.log.some(l => l.call === 'discover')).toBe(true);
  });

  it('treats an aborted run (error set) the same way', async () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([{ kind: 'discovery', startedAt: new Date(now - HOUR), finishedAt: new Date(now - HOUR), error: 'boom' }]);
    const { job, discovery } = makeJob({ at: now, runs });
    await job.tick();
    expect(discovery.log.some(l => l.call === 'discover')).toBe(true);
  });

  it('re-runs discovery once the last one is 24 h old', async () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([{ kind: 'discovery', startedAt: new Date(now - 24 * HOUR), finishedAt: new Date(now - 24 * HOUR) }]);
    const { job, discovery } = makeJob({ at: now, runs });
    await job.tick();
    expect(discovery.log.some(l => l.call === 'discover')).toBe(true);
  });

  it('re-probes when the probe is 6 h old and discovery is not due', async () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([
      { kind: 'discovery', startedAt: new Date(now - 2 * HOUR), finishedAt: new Date(now - 2 * HOUR) },
      { kind: 'probe', startedAt: new Date(now - 6 * HOUR), finishedAt: new Date(now - 6 * HOUR) },
    ]);
    const { job, discovery } = makeJob({
      at: now, runs,
      freeRows: [{ provider: 'groq', modelId: 'a' }, { provider: 'groq', modelId: 'b' }],
    });
    const out = await job.tick();
    expect(out.discovery).toBeNull();
    expect(out.probe).toBeTruthy();
    expect(discovery.log.filter(l => l.call !== 'runGoldenSet')).toEqual([{ call: 'runProbe', rows: 2 }]);
  });

  it('does not re-probe in the same tick that just discovered', async () => {
    // Discovery probes every candidate; doing it again minutes later spends
    // free quota to learn nothing.
    const { job, discovery } = makeJob({ freeRows: [{ provider: 'groq', modelId: 'a' }] });
    const out = await job.tick();
    expect(out.discovery).toBeTruthy();
    expect(out.probe).toBeNull();
    expect(discovery.log.some(l => l.call === 'runProbe')).toBe(false);
  });

  it('skips a re-probe row whose provider has no key — that is not a dead model', async () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0);
    const runs = fakeRuns([
      { kind: 'discovery', startedAt: new Date(now - HOUR) },
      { kind: 'probe', startedAt: new Date(now - 7 * HOUR) },
    ]);
    const { job, discovery } = makeJob({
      at: now, runs,
      providers: { groq: { apiKey: 'k', enabled: true }, cohere: { apiKey: '', enabled: true }, ollama: { apiKey: 'k', enabled: false } },
      freeRows: [
        { provider: 'groq', modelId: 'a' },
        { provider: 'cohere', modelId: 'b' },
        { provider: 'ollama', modelId: 'c' },
      ],
    });
    const out = await job.tick();
    expect(discovery.log.filter(l => l.call !== 'runGoldenSet')).toEqual([{ call: 'runProbe', rows: 1 }]);
    expect(out.probe.skipped).toBe(2);
  });

  it('never lets two ticks overlap', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const discovery = fakeDiscovery({ discover: async () => { await gate; return []; } });
    const { job } = makeJob({ discovery });
    const first = job.tick();
    const second = await job.tick();
    expect(second).toEqual({ skipped: true });
    release();
    await first;
  });
});

/* ── failure never stops the run ──────────────────────────────────────────── */

describe('a failure is recorded, not propagated', () => {
  it('writes a run document even when discovery throws', async () => {
    const discovery = fakeDiscovery({
      discover: async () => { throw new Error('everything is on fire'); },
    });
    const { job, runs } = makeJob({ discovery });
    const out = await job.tick();
    expect(out.discovery.error).toMatch(/on fire/);
    const doc = runs.docs.find(d => d.kind === 'discovery');
    expect(doc).toBeTruthy();
    expect(doc.finishedAt).toBeInstanceOf(Date);
  });

  it('still writes the run when the prune fails halfway', async () => {
    const discovery = fakeDiscovery({
      pruneUnknownProviders: async () => { throw new Error('prune blew up'); },
    });
    const { job, runs } = makeJob({ discovery });
    const out = await job.tick();
    expect(out.discovery.error).toBeNull();
    expect(out.discovery.counts).toMatchObject({ alive: 1 });
    expect(runs.docs.some(d => d.kind === 'discovery')).toBe(true);
  });

  it('records a run that could not start for want of a key', async () => {
    const { job, runs, discovery } = makeJob({ providers: {} });
    const out = await job.tick();
    expect(out.discovery.error).toMatch(/no provider is configured/);
    expect(discovery.log.filter(l => l.call !== 'runGoldenSet')).toEqual([]);
    expect(runs.docs.some(d => d.kind === 'discovery')).toBe(true);
  });

  it('survives a catalogRun collection that will not answer', async () => {
    const runs = fakeRuns();
    runs.findOne = () => ({ sort() { return this; }, lean: async () => { throw new Error('mongo is away'); } });
    runs.create = async () => { throw new Error('mongo is still away'); };
    const { job, discovery } = makeJob({ runs });
    // An unreadable last-run is treated as "never ran", which errs toward
    // running: a catalog one run too fresh beats a catalog nobody refreshed.
    await expect(job.tick()).resolves.toBeTruthy();
    expect(discovery.log.some(l => l.call === 'discover')).toBe(true);
  });

  it('reports what was pruned, and only from the catalog collections', async () => {
    const { job } = makeJob();
    const out = await job.runDiscovery();
    expect(out.pruned).toEqual({ AIModel: 0, AIFreeTier: 0, AIPricing: 0 });
    expect(out.pruned.AIConfig).toBeUndefined();
  });
});

describe('configuredProviders', () => {
  it('is exactly the providers with a key that are not switched off', () => {
    const { job } = makeJob({
      providers: {
        groq: { apiKey: 'k', enabled: true },
        gemini: { apiKey: 'k' },
        cohere: { apiKey: '' },
        ollama: { apiKey: 'k', enabled: false },
      },
    });
    expect(job.configuredProviders()).toEqual(['groq', 'gemini']);
  });
});

/* ── the golden set's own gate ────────────────────────────────────────────── */

/**
 * The number that matters here is 24, and it is load-bearing.
 *
 * The tick is hourly. Six questions across four rows is ~24 provider calls,
 * which is the golden set's ENTIRE daily budget (§3.2: "sample, do not
 * sweep"). Running it on every tick would be 576 calls a day and would trip
 * the very rate limits the probe exists to distinguish from death — so it has
 * a gate of its own rather than riding the tick directly.
 */
describe('the golden set runs daily, not hourly', () => {
  const at = Date.UTC(2026, 8, 16, 12, 0, 0);
  const goldenRun = (finishedAt) => ({ kind: 'golden', startedAt: finishedAt, finishedAt, error: null, counts: {} });

  it('defaults to once a day', () => {
    const { job } = makeJob();
    expect(job.goldenMs).toBe(24 * 60 * 60 * 1000);
  });

  it('runs when nothing has ever run', async () => {
    const { job, discovery } = makeJob({ at });
    await job.tick();
    expect(discovery.log.some((e) => e.call === 'runGoldenSet')).toBe(true);
  });

  it('does NOT run again an hour later', async () => {
    // The whole point. An hourly golden set is 576 calls a day.
    const runs = fakeRuns([goldenRun(new Date(at - 60 * 60 * 1000))]);
    const { job, discovery } = makeJob({ at, runs });
    await job.tick();
    expect(discovery.log.some((e) => e.call === 'runGoldenSet')).toBe(false);
  });

  it('runs again once the day is up', async () => {
    const runs = fakeRuns([goldenRun(new Date(at - 25 * 60 * 60 * 1000))]);
    const { job, discovery } = makeJob({ at, runs });
    await job.tick();
    expect(discovery.log.some((e) => e.call === 'runGoldenSet')).toBe(true);
  });

  it('honours AI_CATALOG_GOLDEN_HOURS', () => {
    process.env.AI_CATALOG_GOLDEN_HOURS = '12';
    const { job } = makeJob();
    expect(job.goldenMs).toBe(12 * 60 * 60 * 1000);
  });

  it('records a run that scored nothing, so it does not retry every hour', async () => {
    // An early return without writing would leave lastRunAt('golden') null
    // forever, which is the hourly-run bug wearing a different hat.
    const { job, runs } = makeJob({ at });
    await job.runGoldenSweep();
    const written = runs.docs.filter((d) => d.kind === 'golden');
    expect(written).toHaveLength(1);
    expect(written[0].counts).toEqual({ scored: 0, offLanguage: 0 });
  });
});

/* ── learning quota from the calls we already make ────────────────────────── */

/**
 * Providers state their limits in `x-ratelimit-*` on every response. Until
 * 2026-09-16 only the REQUEST path read them: `callAI` recorded, while the
 * probe and the golden set called the adapter directly and discarded the
 * headers. Between them those two are ~90 calls a day — most of what this
 * system does to free rows — and exactly one row in the catalog had a
 * remaining-quota reading to show for it.
 */
describe('the sweeps learn about quota from their own calls', () => {
  function recordingJob() {
    const recorded = [];
    const { job, discovery } = makeJob({
      // runProbeSweep returns early with no rows, so it needs one to probe.
      freeRows: [{ provider: 'groq', modelId: 'm-1', isFree: true }],
      discovery: fakeDiscovery({
        runProbe: async ({ callProvider }) => {
          await callProvider('groq', 'p', { model: 'm-1' });
          return [];
        },
        runGoldenSet: async ({ callProvider }) => {
          await callProvider('groq', 'p', { model: 'm-2' });
          return [];
        },
      }),
    });
    job.ai.callProvider = async () => ({ content: 'ok', headers: { 'x-ratelimit-remaining-requests': '17' } });
    job.ai.recordObservedLimits = (provider, modelId, headers) => recorded.push({ provider, modelId, headers });
    return { job, recorded, discovery };
  }

  it('records the headers a probe call came back with', async () => {
    const { job, recorded } = recordingJob();
    await job.runProbeSweep();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ provider: 'groq', modelId: 'm-1' });
    expect(recorded[0].headers['x-ratelimit-remaining-requests']).toBe('17');
  });

  it('records them for a golden-set call too', async () => {
    const { job, recorded } = recordingJob();
    await job.runGoldenSweep();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ provider: 'groq', modelId: 'm-2' });
  });

  it('never lets bookkeeping cost us the answer we just paid for', async () => {
    const { job } = recordingJob();
    job.ai.recordObservedLimits = () => { throw new Error('mongo is down'); };
    const answer = await job.learningCallProvider()('groq', 'p', { model: 'm' });
    expect(answer.content).toBe('ok');
  });

  it('is a no-op for a provider that sends no such headers', async () => {
    // gemini, cloudflare, cohere, ollama, openrouter send nothing to read.
    const { job, recorded } = recordingJob();
    job.ai.callProvider = async () => ({ content: 'ok' });
    await job.learningCallProvider()('gemini', 'p', { model: 'm' });
    expect(recorded[0].headers).toBeUndefined();
  });
});
