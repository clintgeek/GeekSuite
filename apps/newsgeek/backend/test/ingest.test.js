/**
 * src/ingest/pollFeed.js against a real mongod and an injected fetch:
 * storing, the three dedupe layers, aggregator drops, conditional GET,
 * failure backoff, broken, stale, restart safety, NWS.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import constants from '@geeksuite/schemas/newsgeek/constants';
import { pollFeed, backoffMs, MAX_BACKOFF_MIN } from '../src/ingest/pollFeed.js';
import { buildPlaceMatcher } from '../src/ingest/places.js';
import { USER_AGENT } from '../src/ingest/fetchFeed.js';
import { runSeed } from '../src/seed/seed.js';
import { SOURCES } from '../src/seed/data.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';
import { fakeFetch, fixture, ok, status, networkError } from './helpers/fetch.js';

const { BROKEN_AFTER_FAILURES, EXCERPT_MAX } = constants;

const NOW = new Date('2026-10-10T15:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;

let models;
let Place;
let Source;
let Article;
before(async () => {
  models = await startMongo();
  ({ Place, Source, Article } = models);
});
after(stopMongo);
beforeEach(async () => {
  await clearAll();
  await runSeed({ Place, Source, now: () => new Date(NOW.getTime() - 30 * DAY) });
});

async function load(slug) {
  return Source.findOne({ slug }).lean();
}
async function matcher() {
  return buildPlaceMatcher(await Place.find().lean());
}
async function placeId(slug) {
  return String((await Place.findOne({ slug }).lean())._id);
}

/** Poll one feed of a source the way the worker does: re-read state from Mongo first. */
async function poll(slug, fetchImpl, { at = NOW, feedIndex = 0, directDomains = [] } = {}) {
  const source = await load(slug);
  return pollFeed({
    source, feed: source.feeds[feedIndex], models, matcher: await matcher(), directDomains, fetchImpl, now: () => at,
  });
}

const ARK_FEED = 'https://arkadelphian.com/feed/';

describe('storing an RSS feed', () => {
  test('items normalized: excerpt stripped + capped (never the content), canonical url, places, dates', async () => {
    const f = fakeFetch({ [ARK_FEED]: ok(fixture('rss.xml')) });
    const out = await poll('arkadelphian', f);
    assert.equal(out.ok, true);
    assert.equal(out.counts.inserted, 4);

    const docs = await Article.find().sort({ guid: 1 }).lean();
    const [budget, storm, nodate, future] = docs;
    assert.equal(budget.title, 'Board approves budget — Arkadelphia & Caddo Valley');
    assert.equal(budget.canonicalUrl, 'https://arkadelphian.com/2026/10/09/board-approves-budget/');
    assert.ok(budget.excerpt.startsWith('The board met Tuesday. Arkadelphia city directors'));
    assert.ok(budget.excerpt.length <= EXCERPT_MAX);
    assert.ok(!budget.excerpt.includes('alert(1)'));
    assert.ok(!docs.some((d) => d.excerpt.includes('FULL ARTICLE BODY')), 'content:encoded never stored when a summary exists');
    assert.equal(budget.author, 'Joel Phelps');
    assert.equal(budget.publisher, 'The Arkadelphian');
    assert.equal(budget.publisherDomain, 'arkadelphian.com');
    assert.equal(budget.publishedAt.toISOString(), '2026-10-09T14:00:00.000Z');

    // Source places + text matches; the Village is not also the city.
    const ids = (d) => d.places.map(String).sort();
    assert.deepEqual(ids(budget), [await placeId('arkadelphia-ar'), await placeId('caddo-valley-ar'), await placeId('clark-county-ar')].sort());
    assert.deepEqual(ids(storm), [await placeId('arkadelphia-ar'), await placeId('clark-county-ar'), await placeId('hot-spring-county-ar'), await placeId('hot-springs-village-ar')].sort());
    assert.equal(storm.canonicalUrl, 'https://arkadelphian.com/2026/10/09/storm-damage/');

    assert.equal(nodate.excerpt, 'Only content here, bold words about Gurdon.');
    assert.equal(nodate.publishedAt.toISOString(), NOW.toISOString(), 'no date → fetchedAt');
    assert.ok(ids(nodate).includes(await placeId('gurdon-ar')));
    assert.equal(future.publishedAt.toISOString(), NOW.toISOString(), 'two days ahead → fetchedAt');

    const feed = (await load('arkadelphian')).feeds[0];
    assert.equal(feed.lastHttpStatus, 200);
    assert.equal(feed.lastOkAt.toISOString(), NOW.toISOString());
    assert.equal(feed.lastNewItemAt.toISOString(), NOW.toISOString());
    assert.equal(feed.lastItemAt.toISOString(), NOW.toISOString());
    assert.equal(feed.consecutiveFailures, 0);
    assert.equal(feed.nextPollAt.toISOString(), new Date(NOW.getTime() + 30 * MIN).toISOString());
  });

  test('an honest User-Agent and an RSS Accept header are sent', async () => {
    const f = fakeFetch({ [ARK_FEED]: ok(fixture('rss.xml')) });
    await poll('arkadelphian', f);
    assert.equal(f.calls[0].headers['User-Agent'], USER_AGENT);
    assert.equal(USER_AGENT, 'NewsGeek/1.0 (+https://newsgeek.clintgeek.com)');
    assert.match(f.calls[0].headers.Accept, /application\/rss\+xml/);
  });

  test('an Atom feed stores its entries', async () => {
    const f = fakeFetch({ 'https://www.theverge.com/rss/index.xml': ok(fixture('atom.xml')) });
    const out = await poll('the-verge', f);
    assert.equal(out.counts.inserted, 2);
    const a = await Article.findOne({ guid: 'https://www.theverge.com/tech/1' }).lean();
    assert.equal(a.title, 'Apple’s new thing & you');
    assert.equal(a.excerpt, 'It is new.');
    assert.equal(a.author, 'Nilay Patel');
  });
});

describe('restart safety', () => {
  test('the same poll twice inserts nothing new (a restart mid-poll repeats it harmlessly)', async () => {
    const f = fakeFetch({ [ARK_FEED]: ok(fixture('rss.xml')) });
    await poll('arkadelphian', f);
    const second = await poll('arkadelphian', f, { at: new Date(NOW.getTime() + 31 * MIN) });
    assert.equal(second.counts.inserted, 0);
    assert.equal(second.counts.dupGuid, 4);
    assert.equal(await Article.countDocuments(), 4);
    // No new items: lastNewItemAt still the first poll's.
    assert.equal((await load('arkadelphian')).feeds[0].lastNewItemAt.toISOString(), NOW.toISOString());
  });

  test('the (sourceId, guid) unique index stops a racing insert', async () => {
    const source = await load('arkadelphian');
    const doc = {
      sourceId: source._id, feedUrl: ARK_FEED, guid: 'g', url: 'https://a.com/1', canonicalUrl: 'https://a.com/1',
      title: 't', titleKey: 't', publisher: 'p', publishedAt: NOW, fetchedAt: NOW,
    };
    await Article.create(doc);
    await assert.rejects(Article.create({ ...doc, url: 'https://a.com/2', canonicalUrl: 'https://a.com/2' }), (e) => e.code === 11000);
  });
});

describe('dedupe layers', () => {
  const one = (title, link, guid, date = 'Fri, 09 Oct 2026 14:00:00 +0000') => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
    <item><title>${title}</title><link>${link}</link><guid>${guid}</guid><pubDate>${date}</pubDate><description>d</description></item>
    </channel></rss>`;

  test('layer 1: same guid in the same source → skipped, even with a new url', async () => {
    const f = fakeFetch({ [ARK_FEED]: [ok(one('A', 'https://arkadelphian.com/a', 'G1')), ok(one('A edited', 'https://arkadelphian.com/a-2', 'G1'))] });
    await poll('arkadelphian', f);
    const out = await poll('arkadelphian', f, { at: new Date(NOW.getTime() + 31 * MIN) });
    assert.equal(out.counts.dupGuid, 1);
    assert.equal(await Article.countDocuments(), 1);
  });

  test('layer 2: canonical url already stored by ANY source → skipped (tracking params ignored)', async () => {
    await poll('arkadelphian', fakeFetch({ [ARK_FEED]: ok(one('Story', 'https://example.com/story?utm_source=a', 'A1')) }));
    const out = await poll('kark', fakeFetch({ 'https://www.kark.com/news/feed/': ok(one('Story copy', 'https://example.com/story?fbclid=zz#top', 'K1')) }));
    assert.equal(out.counts.dupUrl, 1);
    assert.equal(out.counts.inserted, 0);
    assert.equal(await Article.countDocuments(), 1);
  });

  test('layer 3: same source + same normalized title within 24 h → skipped; outside 24 h → kept', async () => {
    const f = fakeFetch({ [ARK_FEED]: [
      ok(one('Council Meets Tonight!', 'https://arkadelphian.com/a', 'T1', 'Fri, 09 Oct 2026 08:00:00 +0000')),
      ok(one('council meets tonight', 'https://arkadelphian.com/b', 'T2', 'Fri, 09 Oct 2026 20:00:00 +0000')),
      ok(one('Council meets tonight', 'https://arkadelphian.com/c', 'T3', 'Wed, 07 Oct 2026 06:00:00 +0000')),
    ] });
    await poll('arkadelphian', f);
    const second = await poll('arkadelphian', f);
    assert.equal(second.counts.dupTitle, 1);
    const third = await poll('arkadelphian', f);
    assert.equal(third.counts.inserted, 1, 'two days earlier is a different article');
    assert.equal(await Article.countDocuments(), 2);
  });

  test('layer 3 is per source: another source with the same title is kept', async () => {
    await poll('arkadelphian', fakeFetch({ [ARK_FEED]: ok(one('Same headline', 'https://arkadelphian.com/x', 'S1')) }));
    const out = await poll('kark', fakeFetch({ 'https://www.kark.com/news/feed/': ok(one('Same headline', 'https://www.kark.com/x', 'S2')) }));
    assert.equal(out.counts.inserted, 1);
  });
});

describe('Google News aggregator', () => {
  const GN = SOURCES.find((s) => s.slug === 'gnews-malvern').feeds[0].url;

  test('obituaries are kept by default: the seeded blocklist does not drop legacy.com (Chef: "keep obits")', async () => {
    const out = await poll('gnews-malvern', fakeFetch({ [GN]: ok(fixture('gnews.xml')) }), { directDomains: ['arkadelphian.com', 'kark.com'] });
    assert.deepEqual(out.drops, { direct_publisher: 1 });
    assert.equal(await Article.countDocuments({ publisherDomain: /legacy\.com$/ }), 2);
  });

  test('credited to the real publisher, suffix stripped; a blocked domain (any subdomain) and directly-read publishers dropped', async () => {
    await Source.updateOne({ slug: 'gnews-malvern' }, { $set: { blockedDomains: ['legacy.com'] } });
    const out = await poll('gnews-malvern', fakeFetch({ [GN]: ok(fixture('gnews.xml')) }), { directDomains: ['arkadelphian.com', 'kark.com'] });
    assert.deepEqual(out.drops, { blocked_domain: 2, direct_publisher: 1 });
    assert.equal(out.counts.inserted, 2);
    const docs = await Article.find().sort({ publishedAt: -1 }).lean();
    const [biz, pa] = docs;
    assert.equal(biz.title, 'Malvern council approves new water plant');
    assert.equal(biz.titleKey, 'malvern council approves new water plant');
    assert.equal(biz.publisher, 'Arkansas Business');
    assert.equal(biz.publisherDomain, 'arkansasbusiness.com');
    assert.equal(biz.url, 'https://news.google.com/rss/articles/CBMiAAA?oc=5', 'the wrapper is kept in N0');
    assert.equal(biz.excerpt, '', 'title-only source');
    assert.ok(!docs.some((d) => d.publisher === 'Google News'));
    assert.equal(pa.publisher, 'Main Line Times');
  });
});

describe('NWS alerts', () => {
  const NWS = 'https://api.weather.gov/alerts/active?zone=ARC019,ARC059,ARZ053,ARZ054';
  test('an active alert → an official article with expiresAt; an expired one is skipped; geo+json requested', async () => {
    const f = fakeFetch({ [NWS]: ok(fixture('nws.json'), { 'content-type': 'application/geo+json' }) });
    const out = await poll('nws-alerts', f);
    assert.equal(f.calls[0].headers.Accept, 'application/geo+json');
    assert.equal(f.calls[0].headers['User-Agent'], USER_AGENT);
    assert.equal(out.counts.inserted, 1);
    assert.deepEqual(out.drops, { expired: 1 });
    const a = await Article.findOne().lean();
    assert.match(a.title, /^Flood Watch issued/);
    assert.equal(a.url, 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.aaa.001.1');
    assert.equal(a.expiresAt.toISOString(), '2026-10-11T00:00:00.000Z');
    assert.ok(a.excerpt.length <= EXCERPT_MAX && a.excerpt.startsWith('* WHAT...Flooding'));
    assert.equal(a.publisher, 'National Weather Service');
  });
});

describe('conditional GET', () => {
  test('validators stored, sent back next time; 304 is success with no change', async () => {
    const f = fakeFetch({ [ARK_FEED]: [
      ok(fixture('rss.xml'), { etag: '"v1"', 'last-modified': 'Fri, 09 Oct 2026 14:00:00 GMT' }),
      status(304),
    ] });
    await poll('arkadelphian', f);
    const later = new Date(NOW.getTime() + 31 * MIN);
    const out = await poll('arkadelphian', f, { at: later });
    assert.equal(f.calls[1].headers['If-None-Match'], '"v1"');
    assert.equal(f.calls[1].headers['If-Modified-Since'], 'Fri, 09 Oct 2026 14:00:00 GMT');
    assert.equal(out.ok, true);
    assert.equal(out.notModified, true);
    const feed = (await load('arkadelphian')).feeds[0];
    assert.equal(feed.lastHttpStatus, 304);
    assert.equal(feed.lastOkAt.toISOString(), later.toISOString());
    assert.equal(feed.etag, '"v1"', 'kept when the 304 sends none');
    assert.equal(feed.consecutiveFailures, 0);
    assert.equal(feed.nextPollAt.toISOString(), new Date(later.getTime() + 30 * MIN).toISOString());
    assert.equal(await Article.countDocuments(), 4);
  });
});

describe('failures', () => {
  test('backoff doubles per failure from pollEveryMin, capped at 6 h', () => {
    assert.equal(backoffMs(15, 1), 30 * MIN);
    assert.equal(backoffMs(15, 2), 60 * MIN);
    assert.equal(backoffMs(15, 3), 120 * MIN);
    assert.equal(backoffMs(15, 10), MAX_BACKOFF_MIN * MIN);
    assert.equal(backoffMs(60, 1, 3 * 60 * MIN), 3 * 60 * MIN, 'Retry-After wins when longer');
    assert.equal(backoffMs(60, 1, 5 * MIN), 120 * MIN, 'a shorter Retry-After never shortens backoff');
    assert.equal(backoffMs(60, 1, 400 * DAY), DAY, 'an absurd Retry-After is capped');
  });

  test('a 500 is recorded: failures counted, error kept, nextPollAt backed off; success resets', async () => {
    const f = fakeFetch({ [ARK_FEED]: [status(500), status(500), ok(fixture('rss.xml'))] });
    await poll('arkadelphian', f);
    let feed = (await load('arkadelphian')).feeds[0];
    assert.equal(feed.consecutiveFailures, 1);
    assert.equal(feed.lastHttpStatus, 500);
    assert.equal(feed.lastError, 'HTTP 500');
    assert.equal(feed.lastOkAt, null);
    assert.equal(feed.nextPollAt.toISOString(), new Date(NOW.getTime() + 60 * MIN).toISOString());
    await poll('arkadelphian', f);
    feed = (await load('arkadelphian')).feeds[0];
    assert.equal(feed.consecutiveFailures, 2);
    assert.equal(feed.nextPollAt.toISOString(), new Date(NOW.getTime() + 120 * MIN).toISOString());
    await poll('arkadelphian', f);
    feed = (await load('arkadelphian')).feeds[0];
    assert.equal(feed.consecutiveFailures, 0);
    assert.equal(feed.lastError, null);
  });

  test('429 with Retry-After (seconds) is honoured', async () => {
    const MDR = 'https://www.malvern-online.com/search/?f=rss&t=article&l=50';
    await poll('malvern-daily-record', fakeFetch({ [MDR]: status(429, { 'retry-after': '18000' }) }));
    const feed = (await load('malvern-daily-record')).feeds[0];
    assert.equal(feed.lastHttpStatus, 429);
    assert.equal(feed.nextPollAt.toISOString(), new Date(NOW.getTime() + 5 * 60 * MIN).toISOString());
  });

  test('503 with an HTTP-date Retry-After is honoured', async () => {
    const when = new Date(NOW.getTime() + 4 * 60 * MIN);
    await poll('kark', fakeFetch({ 'https://www.kark.com/news/feed/': status(503, { 'retry-after': when.toUTCString() }) }));
    const feed = (await load('kark')).feeds[0];
    assert.equal(feed.nextPollAt.toISOString(), when.toISOString());
  });

  test('network errors, timeouts, oversized bodies and malformed feeds are failures', async () => {
    await poll('kark', fakeFetch({ 'https://www.kark.com/news/feed/': networkError() }));
    assert.equal((await load('kark')).feeds[0].lastError, 'network error (ECONNREFUSED)');

    await poll('thv11', fakeFetch({ 'https://www.thv11.com/feeds/syndication/rss/news': ok(fixture('malformed.xml')) }));
    const thv = (await load('thv11')).feeds[0];
    assert.match(thv.lastError, /^parse: malformed XML/);
    assert.equal(thv.lastHttpStatus, 200);
    assert.equal(thv.consecutiveFailures, 1);

    const source = await load('katv');
    const big = 'x'.repeat(2048);
    await pollFeed({
      source, feed: source.feeds[0], models, now: () => NOW,
      fetchImpl: fakeFetch({ 'https://katv.com/news/local.rss': ok(big) }), fetchOptions: { maxBytes: 1024 },
    });
    assert.match((await load('katv')).feeds[0].lastError, /^body too large/);

    const slow = async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const s2 = await load('arkansas-times');
    await pollFeed({ source: s2, feed: s2.feeds[0], models, now: () => NOW, fetchImpl: slow, fetchOptions: { timeoutMs: 20 } });
    assert.equal((await load('arkansas-times')).feeds[0].lastError, 'timeout after 20 ms');
  });

  test(`after ${BROKEN_AFTER_FAILURES} consecutive failures the source goes broken (and only then)`, async () => {
    await Source.updateOne({ slug: 'kark' }, { $set: { 'feeds.0.consecutiveFailures': BROKEN_AFTER_FAILURES - 2 } });
    const f = fakeFetch({ 'https://www.kark.com/news/feed/': status(500) });
    await poll('kark', f);
    assert.equal((await load('kark')).status, 'active');
    await poll('kark', f);
    const src = await load('kark');
    assert.equal(src.status, 'broken');
    assert.equal(src.feeds[0].consecutiveFailures, BROKEN_AFTER_FAILURES);
  });

  test('a retired source is never flipped to broken', async () => {
    await Source.updateOne({ slug: 'kark' }, { $set: { status: 'retired', 'feeds.0.consecutiveFailures': BROKEN_AFTER_FAILURES + 5 } });
    await poll('kark', fakeFetch({ 'https://www.kark.com/news/feed/': status(500) }));
    assert.equal((await load('kark')).status, 'retired');
  });
});

describe('stale', () => {
  const one = (guid, date) => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
    <item><title>Item ${guid}</title><link>https://arkadelphian.com/${guid}</link><guid>${guid}</guid><pubDate>${date}</pubDate></item>
    </channel></rss>`;

  async function storeHistory(gapsHours) {
    // Articles for the feed spaced by the given gaps, newest = 10 days ago.
    const source = await load('arkadelphian');
    let t = NOW.getTime() - 10 * DAY;
    const docs = [];
    for (let i = 0; i <= gapsHours.length; i += 1) {
      docs.push({
        sourceId: source._id, feedUrl: ARK_FEED, guid: `h${i}`, url: `https://arkadelphian.com/h${i}`, canonicalUrl: `https://arkadelphian.com/h${i}`,
        title: `h${i}`, titleKey: `h${i}`, publisher: 'x', publishedAt: new Date(t), fetchedAt: new Date(t),
      });
      t -= (gapsHours[i] ?? 0) * 3_600_000;
    }
    await Article.insertMany(docs);
  }

  test('OK answers, nothing new for > max(7 × median gap, 3 days) → stale; a new item clears it', async () => {
    await storeHistory([12, 12, 12, 12]); // a twice-a-day feed: threshold = 3.5 days
    await Source.updateOne({ slug: 'arkadelphian' }, { $set: { 'feeds.0.lastNewItemAt': new Date(NOW.getTime() - 10 * DAY) } });
    const f = fakeFetch({ [ARK_FEED]: [status(304), ok(one('fresh', 'Sat, 10 Oct 2026 12:00:00 +0000'))] });
    const out = await poll('arkadelphian', f);
    assert.equal(out.stale, true);
    assert.equal((await load('arkadelphian')).feeds[0].stale, true);

    const out2 = await poll('arkadelphian', f);
    assert.equal(out2.counts.inserted, 1);
    assert.equal((await load('arkadelphian')).feeds[0].stale, false);
  });

  test('a slow feed is judged by its own gap: weekly posts, 10 days quiet → not stale', async () => {
    await storeHistory([7 * 24, 7 * 24, 7 * 24]); // threshold = 49 days
    await Source.updateOne({ slug: 'arkadelphian' }, { $set: { 'feeds.0.lastNewItemAt': new Date(NOW.getTime() - 10 * DAY) } });
    const out = await poll('arkadelphian', fakeFetch({ [ARK_FEED]: status(304) }));
    assert.equal(out.stale, false);
  });

  test('the 3-day floor: a fast feed quiet for 2 days is not stale', async () => {
    await storeHistory([1, 1, 1, 1]);
    await Source.updateOne({ slug: 'arkadelphian' }, { $set: { 'feeds.0.lastNewItemAt': new Date(NOW.getTime() - 2 * DAY) } });
    const out = await poll('arkadelphian', fakeFetch({ [ARK_FEED]: status(304) }));
    assert.equal(out.stale, false);
  });

  test('a feed that never produced anything since the source was added (30 days) → stale', async () => {
    const out = await poll('malvern-agendas', fakeFetch({ 'https://malvernar.gov/RSSFeed.aspx?ModID=65&CID=All-0': ok('<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>') }));
    assert.equal(out.stale, true);
  });

  test('NWS is exempt: no alerts is quiet weather', async () => {
    const NWS = 'https://api.weather.gov/alerts/active?zone=ARC019,ARC059,ARZ053,ARZ054';
    const out = await poll('nws-alerts', fakeFetch({ [NWS]: ok('{"type":"FeatureCollection","features":[]}') }));
    assert.equal(out.stale, false);
  });
});

describe('targeted state writes', () => {
  test('an admin edit landing during a poll is not clobbered', async () => {
    const source = await load('arkadelphian');
    const f = fakeFetch({ [ARK_FEED]: async () => {
      // The gateway renames the source and adds a feed while we fetch.
      await Source.updateOne({ _id: source._id }, { $set: { name: 'Renamed', notes: 'edited' }, $push: { feeds: { url: 'https://arkadelphian.com/extra/', format: 'rss', pollEveryMin: 30 } } });
      return ok(fixture('rss.xml'))();
    } });
    await pollFeed({ source, feed: source.feeds[0], models, now: () => NOW, fetchImpl: f });
    const after2 = await load('arkadelphian');
    assert.equal(after2.name, 'Renamed');
    assert.equal(after2.notes, 'edited');
    assert.equal(after2.feeds.length, 2);
    assert.equal(after2.feeds[0].lastHttpStatus, 200);
    assert.equal(after2.feeds[1].lastFetchAt, null, 'only the polled feed was written');
  });
});

describe('items older than retention', () => {
  test('are never ingested (the purge would delete and the next poll re-add them)', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title>Ancient agenda</title><link>https://malvernar.gov/a</link><guid>old1</guid><pubDate>Mon, 01 Jun 2026 10:00:00 +0000</pubDate></item>
      </channel></rss>`;
    const out = await poll('malvern-agendas', fakeFetch({ 'https://malvernar.gov/RSSFeed.aspx?ModID=65&CID=All-0': ok(xml) }));
    assert.deepEqual(out.drops, { too_old: 1 });
    assert.equal(await Article.countDocuments(), 0);
  });
});
