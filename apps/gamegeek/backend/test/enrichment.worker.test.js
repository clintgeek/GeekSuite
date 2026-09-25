/**
 * The queue: selection, singleton, error survival, status — plus pacing and
 * the trigger gating. apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Running it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, selectionFilter, ERROR_BACKOFF_BASE_MS } from '../src/enrichment/worker.js';
import { createPacer, pacedWithBackoff, STEAM_INTERVAL_MS, STEAM_BACKOFF_MS } from '../src/enrichment/pacing.js';
import { isAutorunEnabled, isEnrichmentDisabled, triggerEnrichment, startEnrichmentSchedule } from '../src/enrichment/service.js';
import { createFakeGameModel, matches } from './helpers/fakeGameModel.js';
import { fakeProviderSet, detailOf, searchHit } from './helpers/fakeProviders.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);
let n = 0;
const game = (enrichment, over = {}) => ({
  _id: `bbbbbbbbbbbbbbbbbbbbbb${String(++n).padStart(2, '0')}`,
  householdId: 'default',
  title: `Game ${n}`,
  developers: [],
  publishers: [],
  genres: [],
  description: '',
  modes: [],
  platformsAvailable: [],
  externalIds: {},
  coverPath: null,
  ...(enrichment === undefined ? {} : { enrichment }),
  ...over,
});

const selected = (docs, configured) => {
  const f = selectionFilter({ configured, now: NOW });
  return docs.filter((d) => matches(d, f)).map((d) => d.title);
};
const STEAM_ONLY = { steam: true, igdb: false, rawg: false };
const WITH_IGDB = { steam: true, igdb: true, rawg: false };

describe('selectionFilter', () => {
  test('no enrichment, null enrichment, pending → selected', () => {
    const docs = [game(undefined, { title: 'missing' }), game(null, { title: 'null' }), game({ status: 'pending' }, { title: 'pending' })];
    assert.deepEqual(selected(docs, STEAM_ONLY), ['missing', 'null', 'pending']);
  });

  test('matched and unlinked → never', () => {
    const docs = [game({ status: 'matched' }), game({ status: 'unlinked', providersTried: [] })];
    assert.deepEqual(selected(docs, WITH_IGDB), []);
  });

  test('manual → never, whatever its status', () => {
    assert.deepEqual(selected([game({ status: 'pending', manual: true })], STEAM_ONLY), []);
  });

  test('no-match / ambiguous that tried every available provider → not retried', () => {
    const docs = [
      game({ status: 'no-match', providersTried: ['steam'] }),
      game({ status: 'ambiguous', providersTried: ['steam'] }),
    ];
    assert.deepEqual(selected(docs, STEAM_ONLY), []);
  });

  test('IGDB newly configured → exactly the misses that did not try igdb are retried', () => {
    const docs = [
      game({ status: 'no-match', providersTried: ['steam'] }, { title: 'missed, no igdb' }),
      game({ status: 'ambiguous', providersTried: ['steam'] }, { title: 'ambiguous, no igdb' }),
      game({ status: 'no-match', providersTried: ['igdb', 'steam'] }, { title: 'already tried igdb' }),
      game({ status: 'unlinked', providersTried: ['steam'] }, { title: 'unlinked' }),
      game({ status: 'matched', providersTried: ['steam'] }, { title: 'matched' }),
    ];
    assert.deepEqual(selected(docs, WITH_IGDB), ['missed, no igdb', 'ambiguous, no igdb']);
  });

  test('error: fewer than 3 attempts, with exponential backoff', () => {
    const base = ERROR_BACKOFF_BASE_MS / 60_000; // minutes
    const docs = [
      game({ status: 'error', attempts: 1, lastTriedAt: minutesAgo(base - 1) }, { title: '1 attempt, too soon' }),
      game({ status: 'error', attempts: 1, lastTriedAt: minutesAgo(base + 1) }, { title: '1 attempt, due' }),
      game({ status: 'error', attempts: 2, lastTriedAt: minutesAgo(base + 1) }, { title: '2 attempts, too soon' }),
      game({ status: 'error', attempts: 2, lastTriedAt: minutesAgo(2 * base + 1) }, { title: '2 attempts, due' }),
      game({ status: 'error', attempts: 3, lastTriedAt: minutesAgo(10_000) }, { title: '3 attempts, done' }),
    ];
    assert.deepEqual(selected(docs, STEAM_ONLY), ['1 attempt, due', '2 attempts, due']);
  });
});

function workerSetup(docs, providers) {
  const Game = createFakeGameModel(docs);
  const logs = [];
  const logger = { info: (o, m) => logs.push(['info', m, o]), warn: () => {}, error: (o, m) => logs.push(['error', m, o]) };
  const deps = { Game, providers, logger, now: () => NOW, fetchCover: async () => null, writeCover: async () => {}, deleteCover: async () => {} };
  return { Game, worker: createWorker(deps), logs, deps };
}

describe('createWorker', () => {
  test('processes every selectable game once, one at a time, and logs a summary line', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const providers = fakeProviderSet({
      steamSearch: {
        search: async (title) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 1));
          inFlight -= 1;
          return title === 'Hades' ? [searchHit('steam', '1145360', 'Hades')] : [];
        },
        details: { 1145360: detailOf('steam', '1145360', 'Hades') },
      },
    });
    const docs = [game(undefined, { title: 'Hades' }), game(undefined, { title: 'Nope' }), game({ status: 'matched' }, { title: 'Done' })];
    const { Game, worker, logs } = workerSetup(docs, providers);
    assert.deepEqual(worker.run({ trigger: 'test' }), { started: true });
    const summary = await worker.whenIdle();
    assert.equal(summary.processed, 2);
    assert.equal(summary.matched, 1);
    assert.equal(summary.noMatch, 1);
    assert.equal(maxInFlight, 1);
    assert.deepEqual(providers.steps.steamSearch.calls.search, ['Hades', 'Nope']);
    assert.equal(Game.docs.find((d) => d.title === 'Nope').enrichment.status, 'no-match');
    assert.ok(logs.some(([lvl, m]) => lvl === 'info' && /enrichment run \(test\): 2 processed, 1 matched, 1 no-match/.test(m)));
    // A second run finds nothing left to do.
    worker.run();
    assert.equal((await worker.whenIdle()).processed, 0);
  });

  test('a second run() while running is a no-op', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const providers = fakeProviderSet({ steamSearch: { search: async () => (await gate, []) } });
    const { worker } = workerSetup([game(undefined)], providers);
    assert.equal(worker.run().started, true);
    assert.equal(worker.isRunning(), true);
    assert.deepEqual(worker.run(), { started: false, reason: 'running' });
    release();
    await worker.whenIdle();
    assert.equal(worker.isRunning(), false);
    assert.equal(providers.steps.steamSearch.calls.search.length, 1);
  });

  test('one game throwing does not stop the run', async () => {
    const providers = fakeProviderSet({ steamSearch: { search: { B: [searchHit('steam', '2', 'B')] }, details: { 2: detailOf('steam', '2', 'B') } } });
    const docs = [game(undefined, { title: 'A' }), game(undefined, { title: 'B' })];
    const { Game, worker } = workerSetup(docs, providers);
    const realFindOne = Game.findOne;
    Game.findOne = (filter) => (filter._id === docs[0]._id ? { lean: async () => { throw new Error('db hiccup'); } } : realFindOne(filter));
    worker.run();
    const summary = await worker.whenIdle();
    assert.equal(summary.error, 1);
    assert.equal(summary.matched, 1);
  });

  test('the kill switch: run() refuses, status says disabled', async () => {
    const { worker, deps } = workerSetup([game(undefined)], fakeProviderSet());
    deps.isDisabled = () => true;
    assert.deepEqual(worker.run(), { started: false, reason: 'disabled' });
    assert.equal((await worker.status('default')).disabled, true);
  });

  test('status: household-scoped counts, queued, providers', async () => {
    const docs = [
      game(undefined),
      game({ status: 'matched' }),
      game({ status: 'matched' }),
      game({ status: 'no-match', providersTried: ['steam'] }),
      game({ status: 'ambiguous', providersTried: ['steam'] }),
      game({ status: 'error', attempts: 3 }),
      game({ status: 'unlinked' }),
      game(undefined, { householdId: 'someone-else' }),
    ];
    const { worker } = workerSetup(docs, fakeProviderSet());
    const s = await worker.status('default');
    assert.deepEqual(s.counts, { matched: 2, pending: 1, noMatch: 1, ambiguous: 1, error: 1, unlinked: 1 });
    assert.equal(s.queued, 1);
    assert.deepEqual(s.providers, { steam: true, igdb: false, rawg: false });
    assert.equal(s.running, false);
    assert.equal(s.lastRunAt, null);
  });
});

describe('pacing', () => {
  function fakeClock() {
    let t = 0;
    const sleeps = [];
    return {
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      sleeps,
      advance: (ms) => (t += ms),
    };
  }

  test('Steam calls start at least 1.5 s apart', async () => {
    const clock = fakeClock();
    const pacer = createPacer({ intervalMs: STEAM_INTERVAL_MS, now: clock.now, sleep: clock.sleep });
    const starts = [];
    await Promise.all([1, 2, 3].map(() => pacer.schedule(async () => starts.push(clock.now()))));
    assert.deepEqual(starts, [0, 1500, 3000]);
  });

  test('a 429 backs off 60 s, then retries', async () => {
    const clock = fakeClock();
    const pacer = createPacer({ intervalMs: STEAM_INTERVAL_MS, now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const result = await pacedWithBackoff(pacer, async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('Steam store search failed: 429'), { status: 429 });
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
    assert.ok(clock.now() >= STEAM_BACKOFF_MS, `waited ${clock.now()}ms`);
  });

  test('other errors are not retried', async () => {
    const clock = fakeClock();
    const pacer = createPacer({ intervalMs: 10, now: clock.now, sleep: clock.sleep });
    let calls = 0;
    await assert.rejects(
      pacedWithBackoff(pacer, async () => {
        calls += 1;
        throw Object.assign(new Error('500'), { status: 500 });
      })
    );
    assert.equal(calls, 1);
  });
});

describe('trigger gating', () => {
  test('autorun only in production or with ENRICHMENT_AUTORUN=1; the kill switch wins', () => {
    assert.equal(isAutorunEnabled({}), false);
    assert.equal(isAutorunEnabled({ NODE_ENV: 'development' }), false);
    assert.equal(isAutorunEnabled({ NODE_ENV: 'production' }), true);
    assert.equal(isAutorunEnabled({ ENRICHMENT_AUTORUN: '1' }), true);
    assert.equal(isAutorunEnabled({ NODE_ENV: 'production', ENRICHMENT_DISABLED: '1' }), false);
    assert.equal(isEnrichmentDisabled({ ENRICHMENT_DISABLED: 'true' }), true);
  });

  test('in tests nothing fires on its own', () => {
    assert.equal(triggerEnrichment('playnite-commit', { env: {} }), false);
    assert.equal(startEnrichmentSchedule({ env: {} }), null);
  });
});
