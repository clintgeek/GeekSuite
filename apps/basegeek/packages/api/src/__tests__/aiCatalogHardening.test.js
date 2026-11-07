/**
 * aiCatalogHardening.test.js — the catalog job's failure modes, 2026-11-06 audit.
 *
 *   C1  a discovery that keeps failing must not starve the 6 h re-probe, must
 *       not re-run the whole list+probe every hour, and a run whose
 *       deactivation sweep failed is not a clean run.
 *   C2  a provider with no key, switched off, or whose key the vault cannot
 *       read is PARKED, not deleted: human overrides, quality and latency
 *       history survive, and come back when the key does. An unreadable key
 *       stops all parking and is recorded on the run.
 *   C3  retirement is a fact (HTTP 404/410 or a structured model_not_found
 *       code), never a guess from a message regex — and an auth failure is a
 *       key problem, not a withdrawn model.
 *   C4  probe-path retirement records `AIModel.retiredAt`; a model that
 *       answers again has it cleared.
 *   C5  a listing that filled its single page is not proof the rest are gone.
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';

const { AICatalogJob, isCleanRun } = await import('../services/aiCatalogJob.js');
const discovery = await import('../services/aiCatalogDiscovery.js');
const { default: AIFreeTier, classifyFreeTierFailure, isRetirement } = await import('../models/AIFreeTier.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AICatalogRun } = await import('../models/AICatalogRun.js');
const { default: AIConfig } = await import('../models/AIConfig.js');

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/** A fake AICatalogRun honouring `field: null` filters the way Mongo does. */
function fakeRuns(seed = []) {
  const docs = [...seed];
  const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), doc);
  return {
    docs,
    create: async (doc) => { docs.push({ ...doc }); return doc; },
    findOne(filter = {}) {
      return {
        sort() { return this; },
        lean: async () => {
          const matching = docs.filter((d) => Object.entries(filter).every(([k, v]) =>
            (v === null ? get(d, k) == null : get(d, k) === v)));
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
    updateOne: async (filter, update) => { writes.push({ op: 'updateOne', filter, update }); return { modifiedCount: 1 }; },
    updateMany: async (filter, update) => { writes.push({ op: 'updateMany', filter, update }); return { modifiedCount: 0 }; },
    deleteMany: async (filter) => { writes.push({ op: 'deleteMany', filter }); return { deletedCount: 0 }; },
  };
}

function fakeDiscovery(overrides = {}) {
  const log = [];
  return {
    log,
    DEFAULT_PROBE_TIMEOUT_MS: 8000,
    safeErrorText: (t) => String(t).slice(0, 80),
    listModels: async () => ({ data: [] }),
    discover: async () => { log.push('discover'); return []; },
    syncResults: async () => { log.push('syncResults'); return { alive: 1, dead: 0, unknown: 0, listed: 1, deactivated: 0 }; },
    summarizeByProvider: () => ({}),
    pruneUnknownProviders: async () => ({}),
    runProbe: async ({ rows }) => { log.push('runProbe'); return rows.map((r) => ({ ...r, status: 'alive', code: 'ok' })); },
    runGoldenSet: async () => [],
    ...overrides,
  };
}

function makeJob({ runs = fakeRuns(), disc = fakeDiscovery(), freeRows = [{ provider: 'groq', modelId: 'a', isFree: true }], providers = { groq: { apiKey: 'k', enabled: true } }, deps = {} } = {}) {
  const job = new AICatalogJob({
    now: () => NOW,
    deps: {
      ai: { providers, callProvider: async () => ({ content: 'ok' }) },
      discovery: disc,
      catalogRun: runs,
      freeTier: fakeCollection(freeRows),
      model: fakeCollection(),
      pricing: fakeCollection(),
      aiConfig: { find: async () => [] },
      providers: Object.keys(providers),
      log: silent,
      ...deps,
    },
  });
  return { job, runs, disc };
}

const run = (kind, agoH, extra = {}) => ({
  kind, startedAt: new Date(NOW - agoH * HOUR), finishedAt: new Date(NOW - agoH * HOUR), error: null, ...extra,
});

/* ── C1 ───────────────────────────────────────────────────────────────────── */

describe('C1: a failing discovery neither starves the probe nor hammers every hour', () => {
  beforeEach(() => {
    delete process.env.AI_CATALOG_DISCOVERY_RETRY_HOURS;
  });

  it('runs the overdue probe sweep when discovery failed an hour ago with a persistent write error', async () => {
    const runs = fakeRuns([
      run('discovery', 30),
      run('discovery', 1, { counts: { listedError: 'E11000 duplicate key' } }),
      run('probe', 9),
    ]);
    const { job, disc } = makeJob({ runs });
    const out = await job.tick();
    expect(disc.log).toContain('runProbe');
    expect(out.probe).toBeTruthy();
  });

  it('backs a failing discovery off for the retry interval instead of re-running every tick', async () => {
    const runs = fakeRuns([run('discovery', 30), run('discovery', 1, { error: 'boom' }), run('probe', 1)]);
    const { job, disc } = makeJob({ runs });
    await job.tick();
    expect(disc.log).not.toContain('discover');
  });

  it('retries a failed discovery once the retry interval (6 h) has passed', async () => {
    const runs = fakeRuns([run('discovery', 30), run('discovery', 6, { error: 'boom' }), run('probe', 1)]);
    const { job, disc } = makeJob({ runs });
    await job.tick();
    expect(disc.log).toContain('discover');
  });

  it('still probes in the same tick when the discovery that just ran aborted', async () => {
    const runs = fakeRuns([run('probe', 9)]);
    const disc = fakeDiscovery({ discover: async () => { throw new Error('listing exploded'); } });
    const { job } = makeJob({ runs, disc });
    const out = await job.tick();
    expect(out.discovery.error).toMatch(/exploded/);
    expect(out.probe).toBeTruthy();
    expect(disc.log).toContain('runProbe');
  });

  it('a discovery whose deactivation sweep failed is not clean — it is retried, not trusted for 24 h', async () => {
    const bad = run('discovery', 7, { counts: { alive: 3, deactivateError: 'write conflict' } });
    expect(isCleanRun(bad)).toBe(false);
    const runs = fakeRuns([run('discovery', 30), bad, run('probe', 1)]);
    const { job, disc } = makeJob({ runs });
    await job.tick();
    expect(disc.log).toContain('discover');
  });
});

/* ── C2 ───────────────────────────────────────────────────────────────────── */

describe('C2: an unconfigured provider is parked, never deleted', () => {
  const clean = async () => {
    await Promise.all([AIFreeTier.deleteMany({}), AIModel.deleteMany({}), AIPricing.deleteMany({}), AICatalogRun.deleteMany({}), AIConfig.deleteMany({})]);
  };
  beforeEach(clean);
  afterAll(clean);

  const seed = async () => {
    await AIFreeTier.create({
      provider: 'together', modelId: 'm-free', isFree: true, override: 'deny', fitness: 'structured',
      health: { consecutiveFailures: 2, lastFailureCode: 'http_429' },
    });
    await AIModel.create({ provider: 'together', modelId: 'm-free', name: 'M', isActive: true });
    await AIPricing.create({ provider: 'together', modelId: 'm-free', inputPrice: 1, outputPrice: 2 }).catch(() => {});
  };

  const realJob = (providers, aiConfig) => new AICatalogJob({
    now: () => NOW,
    deps: {
      ai: { providers, callProvider: async () => ({ content: 'ok' }) },
      discovery: { ...discovery, discover: async () => [] },
      catalogRun: AICatalogRun,
      freeTier: AIFreeTier,
      model: AIModel,
      pricing: AIPricing,
      ...(aiConfig ? { aiConfig } : {}),
      providers: ['groq', 'together'],
      log: silent,
    },
  });

  it('keeps the override, fitness and health of a keyless provider, and restores the row when the key returns', async () => {
    await seed();
    await realJob({ groq: { apiKey: 'k', enabled: true }, together: { apiKey: '', enabled: false } }).runDiscovery();

    const parked = await AIFreeTier.findOne({ provider: 'together', modelId: 'm-free' }).lean();
    expect(parked).toBeTruthy();
    expect(parked.override).toBe('deny');
    expect(parked.fitness).toBe('structured');
    expect(parked.health.consecutiveFailures).toBe(2);
    expect(parked.isFree).toBe(false);
    expect(parked.providerDisabledAt).toBeInstanceOf(Date);
    const model = await AIModel.findOne({ provider: 'together', modelId: 'm-free' }).lean();
    expect(model).toBeTruthy();
    expect(model.isActive).toBe(false);

    await realJob({ groq: { apiKey: 'k', enabled: true }, together: { apiKey: 'k2', enabled: true } }).runDiscovery();
    const back = await AIFreeTier.findOne({ provider: 'together', modelId: 'm-free' }).lean();
    expect(back.isFree).toBe(true);
    expect(back.providerDisabledAt ?? null).toBeNull();
    expect(back.override).toBe('deny');
    const modelBack = await AIModel.findOne({ provider: 'together', modelId: 'm-free' }).lean();
    expect(modelBack.isActive).toBe(true);
  });

  it('touches nothing when a stored key fails to decrypt, and records it on the run', async () => {
    await seed();
    // A well-formed v1 envelope whose auth tag cannot verify: exactly what a
    // wrong KEY_VAULT_SECRET produces for every stored key.
    await AIConfig.collection.insertOne({
      provider: 'together', apiKey: `v1:${'0'.repeat(24)}:${'0'.repeat(32)}:deadbeef`, enabled: true,
    });
    const out = await realJob({ groq: { apiKey: 'k', enabled: true }, together: { apiKey: '', enabled: false } }).runDiscovery();

    const row = await AIFreeTier.findOne({ provider: 'together', modelId: 'm-free' }).lean();
    expect(row.isFree).toBe(true);
    expect(row.providerDisabledAt ?? null).toBeNull();
    expect((await AIModel.findOne({ provider: 'together' }).lean()).isActive).toBe(true);
    expect(out.keyUnreadable).toEqual(['together']);
    const doc = await AICatalogRun.findOne({ kind: 'discovery' }).lean();
    expect(doc.keyUnreadable).toEqual(['together']);
  });

  it('never calls deleteMany for an unconfigured roster provider', async () => {
    const freeTier = fakeCollection();
    const model = fakeCollection();
    const pricing = fakeCollection();
    const { job } = makeJob({
      providers: { groq: { apiKey: 'k', enabled: true }, together: { apiKey: '', enabled: true } },
      disc: { ...fakeDiscovery(), parkUnconfiguredProviders: discovery.parkUnconfiguredProviders, unparkConfiguredProviders: discovery.unparkConfiguredProviders, pruneUnconfiguredProviders: discovery.pruneUnconfiguredProviders },
      deps: { freeTier, model, pricing },
    });
    await job.runDiscovery();
    for (const c of [freeTier, model, pricing]) {
      expect(c.writes.filter((w) => w.op === 'deleteMany' && JSON.stringify(w.filter).includes('together'))).toEqual([]);
    }
  });
});

/* ── C3 ───────────────────────────────────────────────────────────────────── */

describe('C3: retirement needs a fact, not a regex', () => {
  it.each([
    ['unauthorized'],
    ['Wrong API Key'],
    ['Invalid API key provided'],
  ])('a status-less auth failure (%s) is a hard key problem, not a withdrawn model', (msg) => {
    const c = classifyFreeTierFailure(new Error(msg));
    expect(c.hard).toBe(true);
    expect(c.code).toBe('auth');
    expect(isRetirement(c.code)).toBe(false);
  });

  it.each([
    ['The model does not exist'],
    ['this model is no longer available'],
    ['route not found'],
    ['model_not_found'],
  ])('message words alone (%s) cool the row but do not retire it', (msg) => {
    const c = classifyFreeTierFailure(new Error(msg));
    expect(c.hard).toBe(true);
    expect(isRetirement(c.code)).toBe(false);
  });

  it('a structured model_not_found code retires', () => {
    const e1 = Object.assign(new Error('gone'), { code: 'model_not_found' });
    const e2 = Object.assign(new Error('gone'), { error: { code: 'model_not_found' } });
    expect(isRetirement(classifyFreeTierFailure(e1).code)).toBe(true);
    expect(isRetirement(classifyFreeTierFailure(e2).code)).toBe(true);
  });

  it('an actual 404 / 410 still retires', () => {
    expect(isRetirement(classifyFreeTierFailure(Object.assign(new Error('x'), { status: 404 })).code)).toBe(true);
    expect(isRetirement(classifyFreeTierFailure(new Error('Ollama API error (410): {}')).code)).toBe(true);
  });

  it('the probe does not retire a row on an auth failure', async () => {
    const writes = [];
    const results = await discovery.runProbe({
      rows: [{ provider: 'groq', modelId: 'm' }],
      callProvider: async () => { throw new Error('unauthorized'); },
      updateOne: async (f, u) => { writes.push(u); },
      options: { mark: true, revive: true, now: NOW },
    });
    expect(results[0].code).toBe('auth');
    expect(results[0].marked).not.toMatch(/retired/);
    expect(writes.some((u) => u.$set?.isFree === false)).toBe(false);
  });
});

/* ── C4 ───────────────────────────────────────────────────────────────────── */

describe('C4: retirement state is one state', () => {
  const clean = async () => { await Promise.all([AIFreeTier.deleteMany({}), AIModel.deleteMany({})]); };
  beforeEach(clean);
  afterAll(clean);

  it('a probe-path retirement stamps AIModel retiredAt / retiredReason and deactivates it', async () => {
    await AIFreeTier.create({ provider: 'groq', modelId: 'gone-1', isFree: true });
    await AIModel.create({ provider: 'groq', modelId: 'gone-1', name: 'g', isActive: true });
    const { job } = makeJob({
      freeRows: [],
      deps: {
        freeTier: AIFreeTier,
        model: AIModel,
        discovery: discovery,
        ai: {
          providers: { groq: { apiKey: 'k', enabled: true } },
          callProvider: async () => { throw Object.assign(new Error('Groq API error (404): {}'), { status: 404 }); },
        },
      },
    });
    await job.runProbeSweep();
    const m = await AIModel.findOne({ provider: 'groq', modelId: 'gone-1' }).lean();
    expect(m.isActive).toBe(false);
    expect(m.retiredAt).toBeInstanceOf(Date);
    expect(m.retiredReason).toBe('http_404');
    expect((await AIFreeTier.findOne({ provider: 'groq', modelId: 'gone-1' }).lean()).isFree).toBe(false);
  });

  it('a model that answers again has its retirement cleared', async () => {
    await AIModel.create({ provider: 'groq', modelId: 'back-1', name: 'b', isActive: false, retiredAt: new Date(NOW - HOUR), retiredReason: 'http_404' });
    await discovery.writeAlive({ provider: 'groq', modelId: 'back-1', fitness: 'basic', now: NOW }, { freeTier: AIFreeTier, model: AIModel });
    const m = await AIModel.findOne({ provider: 'groq', modelId: 'back-1' }).lean();
    expect(m.isActive).toBe(true);
    expect(m.retiredAt ?? null).toBeNull();
    expect(m.retiredReason ?? null).toBeNull();
  });

  it('a listing that re-activates a request-path retirement clears retiredAt too', async () => {
    await AIModel.create({ provider: 'openrouter', modelId: 'paid-1', name: 'p', isActive: false, retiredAt: new Date(NOW - HOUR), retiredReason: 'http_404' });
    await discovery.writeListed({ provider: 'openrouter', modelId: 'paid-1', name: 'p', now: NOW }, { model: AIModel, freeTier: AIFreeTier });
    const m = await AIModel.findOne({ provider: 'openrouter', modelId: 'paid-1' }).lean();
    expect(m.isActive).toBe(true);
    expect(m.retiredAt ?? null).toBeNull();
  });

  it('a listed candidate that still 404s stays retired, with its first retiredAt kept', async () => {
    const first = new Date(NOW - 5 * 24 * HOUR);
    await AIFreeTier.create({ provider: 'groq', modelId: 'still-gone', isFree: false });
    await AIModel.create({ provider: 'groq', modelId: 'still-gone', name: 's', isActive: false, retiredAt: first, retiredReason: 'http_404' });
    await discovery.syncResults([
      { kind: 'listed', provider: 'groq', modelId: 'still-gone', name: 's', isFree: true },
      { kind: 'probe', provider: 'groq', modelId: 'still-gone', status: 'dead', code: 'http_404' },
    ], { freeTier: AIFreeTier, model: AIModel }, { now: NOW });
    const m = await AIModel.findOne({ provider: 'groq', modelId: 'still-gone' }).lean();
    expect(m.isActive).toBe(false);
    expect(m.retiredAt.getTime()).toBe(first.getTime());
  });
});

/* ── C5 ───────────────────────────────────────────────────────────────────── */

describe('C5: a full single page is not the whole listing', () => {
  it.each([
    ['cloudflare', { result: Array.from({ length: 100 }, (_, i) => ({ name: `@cf/m-${i}` })) }],
    ['cohere', { models: Array.from({ length: 100 }, (_, i) => ({ name: `c-${i}` })) }],
    ['gemini', { models: Array.from({ length: 200 }, (_, i) => ({ name: `models/g-${i}` })) }],
  ])('%s: a page-sized listing does not deactivate what it did not show', async (provider, raw) => {
    const results = await discovery.discover({
      providers: [provider],
      listProvider: async () => raw,
      probeProvider: async () => ({ content: 'ok' }),
      timeoutMs: 50,
      all: true,
    });
    // Drop the probes; this case is about the listing.
    const listingOnly = results.filter((r) => r.kind !== 'probe');
    const model = fakeCollection();
    const freeTier = fakeCollection();
    await discovery.syncResults(listingOnly, { model, freeTier }, { now: NOW });
    expect(model.writes.filter((w) => w.op === 'updateMany')).toEqual([]);
    expect(freeTier.writes.filter((w) => w.op === 'updateMany')).toEqual([]);
  });

  it('a short listing still deactivates what it no longer shows', async () => {
    const results = await discovery.discover({
      providers: ['cohere'],
      listProvider: async () => ({ models: [{ name: 'c-1' }] }),
      probeProvider: async () => ({ content: 'ok' }),
      timeoutMs: 50,
    });
    const model = fakeCollection();
    await discovery.syncResults(results.filter((r) => r.kind !== 'probe'), { model, freeTier: fakeCollection() }, { now: NOW });
    expect(model.writes.filter((w) => w.op === 'updateMany')).toHaveLength(1);
  });
});
