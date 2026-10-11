/**
 * Feed hygiene (2026-10-11, plan "Ingest hygiene"): the Blox platform
 * throttle and the 60-min floor, poll-schedule jitter, and per-source URL
 * path rules at ingest.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pathRulesModule from '@geeksuite/schemas/newsgeek/pathRules';
import paywallsModule from '@geeksuite/schemas/newsgeek/paywalls';
import {
  isBloxFeed, effectivePollMin, makeJitter, noJitter, BLOX_MIN_GAP_MS, BLOX_MIN_POLL_MIN,
} from '../src/ingest/platform.js';
import { createWorker, throttleDue } from '../src/jobs/worker.js';
import { pollFeed, normalizeItem } from '../src/ingest/pollFeed.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';
import { fakeFetch, ok, status } from './helpers/fetch.js';

const { cleanPathExclude, compilePathRules, isPathExcluded } = pathRulesModule;
const { isPaywalledDomain } = paywallsModule;

const NOW = new Date('2026-10-11T15:00:00Z');
const MIN = 60_000;
const SEC = 1000;

const BLOX_A = 'https://www.malvern-online.com/search/?f=rss&t=article&l=50';
const BLOX_B = 'https://www.bentoncourier.com/search/?f=rss&t=article&l=50';
const WP = 'https://arkadelphian.com/feed/';

describe('isBloxFeed', () => {
  test('the six production Blox feeds are Blox; other feeds are not', () => {
    for (const u of [
      BLOX_A, BLOX_B,
      'https://www.ashleycountyledger.com/search/?f=rss&t=article&l=50',
      'https://www.ktbs.com/search/?f=rss&t=article&l=50&c=news/arkansas',
      'https://www.thecabin.net/search/?f=rss&t=article&l=50',
      'https://www.magnoliareporter.com/search/?t=article&f=rss&l=50',
    ]) assert.equal(isBloxFeed(u), true, u);
    for (const u of [
      WP, 'https://www.hotsr.com/rss/headlines/', 'https://news.google.com/rss/search?q=Malvern&f=rss',
      'https://example.com/search/?f=atom', 'https://example.com/search/results?f=rss', 'not a url', '',
    ]) assert.equal(isBloxFeed(u), false, u);
  });

  test('a Blox feed polls no faster than every 60 min; others keep their interval', () => {
    assert.equal(effectivePollMin({ url: BLOX_A, pollEveryMin: 15 }), BLOX_MIN_POLL_MIN);
    assert.equal(effectivePollMin({ url: BLOX_A, pollEveryMin: 120 }), 120);
    assert.equal(effectivePollMin({ url: WP, pollEveryMin: 15 }), 15);
  });
});

describe('jitter', () => {
  test('within ±10 % of the interval; the injected random decides where', () => {
    const ms = 30 * MIN;
    assert.equal(makeJitter(() => 0)(ms), 27 * MIN);
    assert.equal(makeJitter(() => 0.5)(ms), ms);
    assert.ok(makeJitter(() => 0.999999)(ms) <= 33 * MIN);
    assert.ok(makeJitter(() => 0.999999)(ms) > 32.9 * MIN);
    for (let i = 0; i < 200; i += 1) {
      const v = makeJitter()(ms);
      assert.ok(v >= 27 * MIN && v <= 33 * MIN, String(v));
    }
  });
});

describe('throttleDue (pure)', () => {
  const item = (url) => ({ source: {}, feed: { url } });
  test('of several Blox feeds only the first runs; non-Blox all run', () => {
    const due = [item(BLOX_A), item(WP), item(BLOX_B)];
    const { run, deferred } = throttleDue(due, { at: NOW, lastBloxAt: null });
    assert.deepEqual(run.map((d) => d.feed.url), [BLOX_A, WP]);
    assert.deepEqual(deferred.map((d) => d.feed.url), [BLOX_B]);
  });
  test('no Blox feed within 90 s of the last Blox request; at 90 s one goes', () => {
    const due = [item(BLOX_B), item(WP)];
    const early = throttleDue(due, { at: NOW, lastBloxAt: new Date(NOW.getTime() - BLOX_MIN_GAP_MS + SEC) });
    assert.deepEqual(early.run.map((d) => d.feed.url), [WP]);
    const onTime = throttleDue(due, { at: NOW, lastBloxAt: new Date(NOW.getTime() - BLOX_MIN_GAP_MS) });
    assert.deepEqual(onTime.run.map((d) => d.feed.url), [BLOX_B, WP]);
  });
});

describe('with Mongo', () => {
  let models;
  before(async () => { models = await startMongo(); });
  after(stopMongo);
  beforeEach(clearAll);

  const mkSource = (slug, url, over = {}) => models.Source.create({
    slug, name: slug, homepage: new URL(url).origin, kind: 'journalism', sections: ['local'], status: 'active',
    feeds: [{ url, format: 'rss', pollEveryMin: 30 }], ...over,
  });

  describe('platform throttle in the worker', () => {
    test('two Blox feeds due in one tick → one fetched, the other only ≥ 90 s later; non-Blox unaffected', async () => {
      await mkSource('blox-a', BLOX_A);
      await mkSource('blox-b', BLOX_B);
      await mkSource('wp', WP);
      const f = fakeFetch({ [BLOX_A]: status(304), [BLOX_B]: status(304), [WP]: status(304) });
      let clock = NOW;
      const w = createWorker({ models, fetchImpl: f, now: () => clock, jitter: noJitter });

      const t1 = await w.tick();
      assert.equal(t1.due, 3);
      assert.equal(t1.deferred, 1);
      assert.deepEqual(f.calls.map((c) => c.url).sort(), [BLOX_A, WP].sort());

      clock = new Date(NOW.getTime() + 60 * SEC); // the next tick: too soon
      const t2 = await w.tick();
      assert.equal(t2.due, 1);
      assert.equal(t2.polled, 0);
      assert.equal(t2.deferred, 1);
      assert.equal(f.calls.length, 2);

      clock = new Date(NOW.getTime() + 90 * SEC);
      const t3 = await w.tick();
      assert.equal(t3.polled, 1);
      assert.equal(f.calls.at(-1).url, BLOX_B);

      // A Blox feed polled OK is next due after the 60-min floor (pollEveryMin 30).
      const a = await models.Source.findOne({ slug: 'blox-a' }).lean();
      assert.equal(a.feeds[0].nextPollAt.toISOString(), new Date(NOW.getTime() + 60 * MIN).toISOString());
      const wp = await models.Source.findOne({ slug: 'wp' }).lean();
      assert.equal(wp.feeds[0].nextPollAt.toISOString(), new Date(NOW.getTime() + 30 * MIN).toISOString());
    });

    test('never two Blox requests in flight, even across hosts (the shared limiter key, with the gap off)', async () => {
      await mkSource('blox-a', BLOX_A);
      await mkSource('blox-b', BLOX_B);
      let inFlight = 0;
      let peak = 0;
      const slow = async () => {
        inFlight += 1; peak = Math.max(peak, inFlight);
        await new Promise((r) => { setTimeout(r, 5); });
        inFlight -= 1;
        return new Response(null, { status: 304 });
      };
      const f = fakeFetch({ [BLOX_A]: slow, [BLOX_B]: slow });
      const w = createWorker({ models, fetchImpl: f, now: () => NOW, concurrency: 4, jitter: noJitter, bloxMinGapMs: 0 });
      await w.tick();
      assert.equal(f.calls.length, 2, 'both ran in this tick…');
      assert.equal(peak, 1, '…one after the other');
    });
  });

  describe('jitter on nextPollAt', () => {
    test('success and failure schedules are spread by the injected jitter; a Retry-After is never undercut', async () => {
      const src = await mkSource('wp', WP);
      const low = makeJitter(() => 0);
      await pollFeed({ source: src.toObject(), feed: src.toObject().feeds[0], models, now: () => NOW, fetchImpl: fakeFetch({ [WP]: status(304) }), jitter: low });
      let feed = (await models.Source.findOne({ slug: 'wp' }).lean()).feeds[0];
      assert.equal(feed.nextPollAt.getTime() - NOW.getTime(), 27 * MIN);

      const high = makeJitter(() => 0.999999);
      await pollFeed({ source: src.toObject(), feed, models, now: () => NOW, fetchImpl: fakeFetch({ [WP]: status(500) }), jitter: high });
      feed = (await models.Source.findOne({ slug: 'wp' }).lean()).feeds[0];
      const d = feed.nextPollAt.getTime() - NOW.getTime();
      assert.ok(d > 60 * MIN && d <= 66 * MIN, `failure backoff 60 min, jittered up: ${d / MIN}`);

      await pollFeed({ source: src.toObject(), feed, models, now: () => NOW, fetchImpl: fakeFetch({ [WP]: status(429, { 'retry-after': '18000' }) }), jitter: low });
      feed = (await models.Source.findOne({ slug: 'wp' }).lean()).feeds[0];
      assert.equal(feed.nextPollAt.getTime() - NOW.getTime(), 5 * 60 * MIN, 'jitter never brings a Retry-After forward');
    });
  });

  describe('per-source path rules at ingest', () => {
    const rss = (links) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${
      links.map((l, i) => `<item><title>Item ${i}</title><link>${l}</link><guid>${l}</guid><pubDate>Sat, 10 Oct 2026 12:00:00 +0000</pubDate></item>`).join('')
    }</channel></rss>`;

    test('items whose pathname matches are dropped and counted as drops.path_excluded; others stored', async () => {
      const src = await mkSource('blox-a', BLOX_A, { pathExclude: ['^/online_features/', '/press_releases/', '^/news/(national|world|nation)/', '^/ap/'] });
      const base = 'https://www.malvern-online.com';
      const links = [
        `${base}/online_features/press_releases/acme-widgets/article_1.html`,
        `${base}/news/national/story_2.html`,
        `${base}/ap/business/story_3.html`,
        `${base}/news/local/council_4.html`,
        `${base}/news/local/council_5.html?utm_source=online_features`, // the query is not the path
        `${base}/sports/press_releases/x_6.html`,
      ];
      const out = await pollFeed({ source: src.toObject(), feed: src.toObject().feeds[0], models, now: () => NOW, fetchImpl: fakeFetch({ [BLOX_A]: ok(rss(links)) }), jitter: noJitter });
      assert.equal(out.ok, true);
      assert.equal(out.drops.path_excluded, 4);
      assert.equal(out.counts.inserted, 2);
      assert.deepEqual((await models.Article.find().lean()).map((a) => new URL(a.url).pathname).sort(), ['/news/local/council_4.html', '/news/local/council_5.html']);
    });

    test('a source without rules keeps everything; a stored rule that no longer compiles is ignored, not fatal', () => {
      const raw = { title: 'X', link: 'https://www.theguardian.com/sport/2026/oct/10/nfl-today', guid: 'g1', date: 'Sat, 10 Oct 2026 12:00:00 +0000' };
      const feed = { url: 'https://www.theguardian.com/us-news/rss' };
      const plain = { _id: 'id', name: 'G', kind: 'journalism', homepage: 'https://www.theguardian.com', places: [] };
      assert.ok(normalizeItem(raw, { source: plain, feed, fetchedAt: NOW }).doc);
      assert.equal(normalizeItem(raw, { source: { ...plain, pathExclude: ['^/sport/'] }, feed, fetchedAt: NOW }).drop, 'path_excluded');
      assert.ok(normalizeItem(raw, { source: { ...plain, pathExclude: ['(unclosed'] }, feed, fetchedAt: NOW }).doc);
    });
  });
});

describe('pathRules (schemas)', () => {
  test('cleanPathExclude: trims, drops empties and duplicates; enforces count, length and compile', () => {
    assert.deepEqual(cleanPathExclude([' ^/a/ ', '', '^/a/', '/b/']), { ok: true, rules: ['^/a/', '/b/'] });
    assert.equal(cleanPathExclude(Array.from({ length: 21 }, (_, i) => `/p${i}/`)).ok, false);
    assert.equal(cleanPathExclude(Array.from({ length: 20 }, (_, i) => `/p${i}/`)).ok, true);
    assert.equal(cleanPathExclude(['/'.repeat(201)]).ok, false);
    assert.equal(cleanPathExclude(['/'.repeat(200)]).ok, true);
    assert.equal(cleanPathExclude(['(unclosed']).ok, false);
    assert.equal(cleanPathExclude('nope').ok, false);
  });
  test('isPathExcluded matches the pathname only, any of the URLs', () => {
    const rules = compilePathRules(['^/sport/']);
    assert.equal(isPathExcluded('https://x.com/sport/a', rules), true);
    assert.equal(isPathExcluded('https://x.com/us-news/a?section=/sport/', rules), false);
    assert.equal(isPathExcluded('https://sport.x.com/a', rules), false);
    assert.equal(isPathExcluded(['not a url', 'https://x.com/sport/b'], rules), true);
    assert.equal(isPathExcluded('https://x.com/sport/a', []), false);
  });
});

describe('paywalled domains (2026-10-11)', () => {
  test('the WEHCO papers with new direct sources are listed, so their Google News copies hide too', () => {
    for (const d of ['camdenarknews.com', 'www.camdenarknews.com', 'eldoradonews.com', 'obits.eldoradonews.com']) assert.equal(isPaywalledDomain(d), true, d);
    assert.equal(isPaywalledDomain('notcamdenarknews.com'), false);
  });
});
