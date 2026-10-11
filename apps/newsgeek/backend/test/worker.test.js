/**
 * src/jobs/worker.js — due selection, per-host limit, resume from DB state,
 * schedule switches, status for /api/health.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, dueFeeds } from '../src/jobs/worker.js';
import { runSeed } from '../src/seed/seed.js';
import { SOURCES } from '../src/seed/data.js';
import { isBloxFeed } from '../src/ingest/platform.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';
import { fakeFetch, status, ok, fixture } from './helpers/fetch.js';

const NOW = new Date('2026-10-10T15:00:00Z');
const MIN = 60_000;

let models;
before(async () => { models = await startMongo(); });
after(stopMongo);
beforeEach(async () => {
  await clearAll();
  await runSeed({ Place: models.Place, Source: models.Source, now: () => NOW });
});

const allFeedUrls = SOURCES.flatMap((s) => s.feeds.map((f) => f.url));
// Blox feeds go one per tick (platform throttle, hygiene.test.js); the rest all at once.
const bloxUrls = allFeedUrls.filter(isBloxFeed);
const firstTickUrls = allFeedUrls.length - bloxUrls.length + 1;

describe('dueFeeds', () => {
  test('null or past nextPollAt is due, future is not; never-polled first', () => {
    const at = NOW;
    const sources = [{ feeds: [
      { url: 'a', nextPollAt: new Date(at.getTime() - MIN) },
      { url: 'b', nextPollAt: null },
      { url: 'c', nextPollAt: new Date(at.getTime() + MIN) },
      { url: 'd', nextPollAt: at },
    ] }];
    assert.deepEqual(dueFeeds(sources, at).map((d) => d.feed.url), ['b', 'a', 'd']);
  });
});

describe('tick', () => {
  test('first tick polls every active non-Blox feed and ONE Blox feed, never two requests to one host at a time', async () => {
    let inFlight = new Map();
    let perHostPeak = 0;
    const routes = Object.fromEntries(allFeedUrls.map((u) => [u, async () => {
      const host = new URL(u).hostname;
      inFlight.set(host, (inFlight.get(host) || 0) + 1);
      perHostPeak = Math.max(perHostPeak, inFlight.get(host));
      await new Promise((r) => { setTimeout(r, 3); });
      inFlight.set(host, inFlight.get(host) - 1);
      return status(304)();
    }]));
    const f = fakeFetch(routes);
    const w = createWorker({ models, fetchImpl: f, concurrency: 4, now: () => NOW });
    const out = await w.tick();
    assert.ok(bloxUrls.length >= 6, 'the six Blox papers are seeded');
    assert.equal(out.due, allFeedUrls.length);
    assert.equal(out.polled, firstTickUrls);
    assert.equal(out.deferred, bloxUrls.length - 1);
    assert.equal(f.calls.length, firstTickUrls);
    assert.equal(f.calls.filter((c) => isBloxFeed(c.url)).length, 1);
    assert.equal(perHostPeak, 1);
    // Malvern Daily Record (the most overdue Blox feed — seed order): exactly one request, to exactly that URL.
    assert.deepEqual(f.calls.filter((c) => c.url.includes('malvern-online.com')).map((c) => c.url), ['https://www.malvern-online.com/search/?f=rss&t=article&l=50']);

    const st = w.status();
    assert.equal(st.activeSources, SOURCES.length);
    assert.equal(st.feedsDue, allFeedUrls.length);
    assert.equal(st.lastTickDeferred, bloxUrls.length - 1);
    assert.equal(st.lastTickAt.toISOString(), NOW.toISOString());
    inFlight = null;
  });

  test('resumes from DB state: a second worker (a restart) a minute later polls only the deferred Blox feeds', async () => {
    const f = fakeFetch(Object.fromEntries(allFeedUrls.map((u) => [u, status(304)])));
    await createWorker({ models, fetchImpl: f, now: () => NOW }).tick();
    const restarted = createWorker({ models, fetchImpl: f, now: () => new Date(NOW.getTime() + MIN) });
    const out = await restarted.tick();
    // Everything polled is scheduled ahead; the Blox feeds held back are still
    // due, and the restarted worker (no memory of the last Blox request) takes one.
    assert.equal(out.due, bloxUrls.length - 1);
    assert.equal(out.polled, 1);
    assert.equal(f.calls.length, firstTickUrls + 1);
  });

  test('only active sources are polled; "check now" (nextPollAt = now) is picked up', async () => {
    const f = fakeFetch(Object.fromEntries(allFeedUrls.map((u) => [u, status(304)])));
    await createWorker({ models, fetchImpl: f, now: () => NOW }).tick();
    await models.Source.updateOne({ slug: 'kark' }, { $set: { status: 'retired' } });
    const later = new Date(NOW.getTime() + 2 * MIN);
    await models.Source.updateOne({ slug: 'kark' }, { $set: { 'feeds.$[].nextPollAt': later } });
    await models.Source.updateOne({ slug: 'katv' }, { $set: { 'feeds.$[].nextPollAt': later } });
    // Take the Blox feeds out of the picture (they are still due from the first tick).
    await models.Source.updateMany({ 'feeds.url': { $in: bloxUrls } }, { $set: { 'feeds.$[].nextPollAt': new Date(later.getTime() + 60 * MIN) } });
    const out = await createWorker({ models, fetchImpl: f, now: () => later }).tick();
    assert.equal(out.due, 1);
    assert.equal(f.calls.at(-1).url, 'https://katv.com/news/local.rss');
  });

  test('a database error in one poll is contained; the tick finishes', async () => {
    // Every feed answers with items, so every poll reaches Article.find — which throws.
    const f = fakeFetch(Object.fromEntries(allFeedUrls.map((u) => [u, ok(fixture('rss.xml'))])));
    let finds = 0;
    const broken = { ...models, Article: { find: () => { finds += 1; throw new Error('db down'); } } };
    const w = createWorker({ models: broken, fetchImpl: f, now: () => NOW });
    const out = await w.tick();
    assert.equal(out.due, allFeedUrls.length);
    assert.ok(finds > 0, 'the failing call was reached');
    // Every poll reaches an Article query (storing, or the stale check) and fails;
    // NWS fails earlier, at parse (rss.xml is not GeoJSON). None escapes the tick.
    assert.equal(out.failed, firstTickUrls);
    assert.equal(w.status().lastTickError, null);
  });
});

describe('schedule switches', () => {
  test('off outside production; INGEST_AUTORUN=1 turns it on; INGEST_DISABLED=1 wins', async () => {
    const w = () => createWorker({ models, fetchImpl: fakeFetch(), now: () => NOW });
    const a = w();
    assert.equal(a.start({ env: { NODE_ENV: 'development' } }).enabled, false);
    const b = w();
    assert.equal(b.start({ env: { NODE_ENV: 'development', INGEST_AUTORUN: '1' }, bootDelayMs: 1e9 }).enabled, true);
    await b.stop();
    const c = w();
    assert.equal(c.start({ env: { NODE_ENV: 'production' }, bootDelayMs: 1e9 }).enabled, true);
    await c.stop();
    const d = w();
    assert.equal(d.start({ env: { NODE_ENV: 'production', INGEST_DISABLED: '1' } }).enabled, false);
    assert.equal(d.status().enabled, false);
  });
});
