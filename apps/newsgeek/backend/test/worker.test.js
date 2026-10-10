/**
 * src/jobs/worker.js — due selection, per-host limit, resume from DB state,
 * schedule switches, status for /api/health.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, dueFeeds } from '../src/jobs/worker.js';
import { runSeed } from '../src/seed/seed.js';
import { SOURCES } from '../src/seed/data.js';
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
  test('first tick polls every active feed once, never two requests to one host at a time', async () => {
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
    assert.equal(out.due, allFeedUrls.length);
    assert.equal(out.polled, allFeedUrls.length);
    assert.equal(f.calls.length, allFeedUrls.length);
    assert.equal(perHostPeak, 1);
    // Malvern Daily Record: exactly one request, to exactly that URL.
    assert.deepEqual(f.calls.filter((c) => c.url.includes('malvern-online.com')).map((c) => c.url), ['https://www.malvern-online.com/search/?f=rss&t=article&l=50']);

    const st = w.status();
    assert.equal(st.activeSources, SOURCES.length);
    assert.equal(st.feedsDue, allFeedUrls.length);
    assert.equal(st.lastTickAt.toISOString(), NOW.toISOString());
    inFlight = null;
  });

  test('resumes from DB state: a second worker (a restart) a minute later polls nothing', async () => {
    const f = fakeFetch(Object.fromEntries(allFeedUrls.map((u) => [u, status(304)])));
    await createWorker({ models, fetchImpl: f, now: () => NOW }).tick();
    const restarted = createWorker({ models, fetchImpl: f, now: () => new Date(NOW.getTime() + MIN) });
    const out = await restarted.tick();
    assert.equal(out.due, 0);
    assert.equal(f.calls.length, allFeedUrls.length);
  });

  test('only active sources are polled; "check now" (nextPollAt = now) is picked up', async () => {
    const f = fakeFetch(Object.fromEntries(allFeedUrls.map((u) => [u, status(304)])));
    await createWorker({ models, fetchImpl: f, now: () => NOW }).tick();
    await models.Source.updateOne({ slug: 'kark' }, { $set: { status: 'retired' } });
    const later = new Date(NOW.getTime() + 2 * MIN);
    await models.Source.updateOne({ slug: 'kark' }, { $set: { 'feeds.$[].nextPollAt': later } });
    await models.Source.updateOne({ slug: 'katv' }, { $set: { 'feeds.$[].nextPollAt': later } });
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
    assert.equal(out.failed, allFeedUrls.length);
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
