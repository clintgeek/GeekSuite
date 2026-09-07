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
          const matching = docs.filter(d => d.kind === kind);
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
    expect(discovery.log.map(l => l.call)).toEqual(['discover', 'syncResults', 'prune']);
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
    expect(discovery.log).toEqual([]);
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
    expect(discovery.log).toEqual([{ call: 'runProbe', rows: 2 }]);
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
    expect(discovery.log).toEqual([{ call: 'runProbe', rows: 1 }]);
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
    expect(discovery.log).toEqual([]);
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
