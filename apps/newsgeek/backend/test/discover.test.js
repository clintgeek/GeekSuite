/**
 * POST /api/discover — reader discovery (DOCS/NEWSGEEK_PLAN.md "Discovery").
 * A local http server plays every site; hostnames resolve through an injected
 * resolver and the SSRF guard's TEST-ONLY allow-list lets 127.0.0.1 on the
 * server's port through. Production builds the guard with no allow-list and
 * nothing in a request can change that (see the UNSAFE_URL tests).
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import createApp from '../src/app.js';
import { createSafeFetch } from '../src/lib/safeFetch.js';
import { normalizeInputUrl, suggestKind, extractAlternates, extractSiteName, DISCOVERY_BUDGET, NO_FEED_MESSAGE } from '../src/discover/discover.js';
import { detectPaywall } from '../src/ingest/paywallMarkers.js';
import { startMongo, stopMongo, clearAll, models } from './helpers/mongo.js';

const { Place, Source } = models;
const NOW = new Date('2026-10-10T18:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toUTCString();

let port;
let server;
const hits = []; // { host, path }
let routes = {}; // `${host}${path}` → (req, res) handler

function rss(title, link, items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>${link}</link>${items.map((it) => `
    <item><title>${it.title}</title><link>${it.link}</link><guid>${it.link}</guid><pubDate>${it.date}</pubDate></item>`).join('')}
  </channel></rss>`;
}
function atom(title, entries) {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${title}</title>${entries.map((e) => `
    <entry><title>${e.title}</title><link href="${e.link}"/><id>${e.link}</id><updated>${e.date}</updated></entry>`).join('')}</feed>`;
}
const send = (body, type = 'text/html; charset=utf-8', status = 200) => (req, res) => { res.writeHead(status, { 'content-type': type }); res.end(body); };
const redirect = (to) => (req, res) => { res.writeHead(302, { Location: to }); res.end(); };

function url(host, p = '/') { return `http://${host}:${port}${p}`; }

function setupSites() {
  routes = {};
  const wp = (p) => `wp.test${p}`;
  // A WordPress paper: an older Atom feed listed first, the RSS feed second,
  // a comments feed (skipped), and an alternate on a private address (refused, skipped).
  routes[wp('/')] = send(`<!doctype html><html><head>
    <title>Home | The Gurdon Ledger</title>
    <meta property="og:site_name" content="The Gurdon Ledger">
    <link rel="alternate" type="application/atom+xml" title="Atom" href="/atom.xml">
    <link rel="alternate" type="application/rss+xml" title="The Gurdon Ledger &raquo; Feed" href="${url('wp.test', '/feed/')}">
    <link rel="alternate" type="application/rss+xml" title="The Gurdon Ledger &raquo; Comments Feed" href="/comments/feed/">
    <link rel="alternate" type="application/rss+xml" title="Sneaky" href="http://10.1.1.1/feed">
    <link rel="stylesheet" href="/wp-content/themes/x.css">
    </head><body>hello</body></html>`);
  routes[wp('/atom.xml')] = send(atom('Ledger (atom)', [
    { title: 'Old news', link: url('wp.test', '/old'), date: new Date(NOW.getTime() - 30 * 86400_000).toISOString() },
  ]), 'application/atom+xml');
  routes[wp('/feed/')] = send(rss('The Gurdon Ledger', url('wp.test', '/'), [
    { title: 'Gurdon council &amp; the water plant', link: url('wp.test', '/a1'), date: hoursAgo(2) },
    { title: 'Arkadelphia school board meets', link: url('wp.test', '/a2'), date: hoursAgo(5) },
    { title: 'Friday football', link: url('wp.test', '/a3'), date: hoursAgo(30) },
    { title: 'Older story', link: url('wp.test', '/a4'), date: hoursAgo(80) },
  ]), 'application/rss+xml');
  routes[wp('/a1')] = send('<html><script type="application/ld+json">{"isAccessibleForFree": false}</script><script src="https://cdn.zephr.com/x.js"></script></html>');
  routes[wp('/comments/feed/')] = send(rss('comments', url('wp.test', '/'), []), 'application/rss+xml');

  // No alternates: found by the platform paths (/rss.xml is 6th in line).
  routes['plain.test/'] = send('<html><head><title>Plain Weekly</title></head><body></body></html>');
  routes['plain.test/rss.xml'] = send(rss('Plain Weekly', url('plain.test', '/'), [
    { title: 'A plain story', link: url('plain.test', '/s1'), date: hoursAgo(3) },
  ]), 'application/rss+xml');
  routes['plain.test/s1'] = send('<html><body>An ordinary free article.</body></html>');

  // The pasted URL is itself a feed.
  routes['feedonly.test/news.rss'] = send(rss('Feed Only Gazette', 'http://www.feedonly.test/home', [
    { title: 'Item one', link: url('feedonly.test', '/i1'), date: hoursAgo(1) },
  ]), 'application/rss+xml');
  routes['feedonly.test/i1'] = send('<html><div class="pmpro_content_message">Subscribers only</div></html>');

  // No feed anywhere; every guessed path redirects once (each hop counts).
  routes['nofeed.test/'] = send('<html><head><title>Only Pages</title></head></html>');
  for (const p of ['/feed/', '/search/?f=rss&t=article&l=50', '/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', '/blog-feed.xml', '/rss', '/rss.xml', '/feed.atom', '/index.rss']) {
    routes[`nofeed.test${p}`] = redirect('/missing');
  }

  // Four guessed paths redirect (8 hops); /rss would be a feed, but the last
  // request of the budget belongs to the paywall check.
  routes['late.test/'] = send('<html><head><title>Late</title></head></html>');
  for (const p of ['/feed/', '/search/?f=rss&t=article&l=50', '/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', '/blog-feed.xml']) {
    routes[`late.test${p}`] = redirect('/missing');
  }
  routes['late.test/rss'] = send(rss('Late', url('late.test', '/'), [{ title: 'x', link: url('late.test', '/x'), date: hoursAgo(1) }]), 'application/rss+xml');

  // A publisher on PAYWALLED_DOMAINS whose article markup shows nothing.
  routes['www.hotsr.com/feed/'] = send(rss('Sentinel', url('www.hotsr.com', '/'), [{ title: 'y', link: url('www.hotsr.com', '/y'), date: hoursAgo(1) }]), 'application/rss+xml');
  routes['www.hotsr.com/y'] = send('<html>plain</html>');

  // A redirect from a public-looking host to a private one.
  routes['redir.test/'] = redirect(`http://lan.test:${port}/`);
  // A CivicPlus city site on .gov.
  routes['city.test/'] = send('<html><head><title>City of Gurdon</title><script src="https://cp.civicplus.com/x.js"></script></head></html>');
  routes['city.test/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml'] = send(rss('City of Gurdon', url('city.test', '/'), [
    { title: 'Water main notice', link: url('city.test', '/n1'), date: hoursAgo(4) },
  ]), 'application/rss+xml');
}

const resolver = async (host) => {
  const map = {
    'wp.test': '127.0.0.1', 'plain.test': '127.0.0.1', 'feedonly.test': '127.0.0.1', 'www.feedonly.test': '127.0.0.1',
    'nofeed.test': '127.0.0.1', 'late.test': '127.0.0.1', 'www.hotsr.com': '127.0.0.1', 'redir.test': '127.0.0.1', 'city.test': '127.0.0.1', 'lan.test': '10.0.0.7',
  };
  if (!map[host]) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
  return [{ address: map[host], family: 4 }];
};

const USERS = { alice: { id: 'u-alice', username: 'alice' }, bob: { id: 'u-bob', username: 'bob' } };
const validateSession = async (token) => {
  if (!USERS[token]) throw Object.assign(new Error('invalid'), { response: { status: 401 } });
  return USERS[token];
};
const auth = (who) => ({ Authorization: `Bearer ${who}` });

let app;
let clockMs = NOW.getTime();
let publicPath;
before(async () => {
  await startMongo();
  server = http.createServer((req, res) => {
    const host = String(req.headers.host).replace(/:\d+$/, '');
    hits.push({ host, path: req.url });
    const h = routes[`${host}${req.url}`];
    if (h) return h(req, res);
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = String(server.address().port);
  publicPath = fs.mkdtempSync(path.join(os.tmpdir(), 'newsgeek-public-'));
  const discoverFetch = createSafeFetch({ resolve: resolver, extraAllowedAddresses: ['127.0.0.1'], extraAllowedPorts: [port] });
  app = createApp({ publicPath, validateSession, discoverFetch, dbState: () => 1, clock: () => clockMs });
});
after(async () => {
  await new Promise((r) => server.close(r));
  await stopMongo();
  fs.rmSync(publicPath, { recursive: true, force: true });
});
beforeEach(async () => {
  await clearAll();
  setupSites();
  hits.length = 0;
  clockMs += 2 * 3600_000; // a fresh rate-limit window for every test
});

const discover = (u, who = 'alice') => request(app).post('/api/discover').set(auth(who)).send({ url: u });
const hostHits = (host) => hits.filter((h) => h.host === host).length;

async function gazetteer() {
  const ar = await Place.create({ slug: 'arkansas', name: 'Arkansas', kind: 'state' });
  const clark = await Place.create({ slug: 'clark-county-ar', name: 'Clark County', kind: 'county', parentId: ar._id });
  await Place.create({ slug: 'gurdon-ar', name: 'Gurdon', kind: 'town', parentId: clark._id });
  await Place.create({ slug: 'arkadelphia-ar', name: 'Arkadelphia', kind: 'town', parentId: clark._id });
}

describe('POST /api/discover: finding feeds', () => {
  test('a page with alternates: feeds validated, best (newest) first, comments + private alternates skipped', async () => {
    await gazetteer();
    const res = await discover(url('wp.test', '/'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const b = res.body;
    assert.equal(b.ok, true);
    assert.deepEqual(b.site, { name: 'The Gurdon Ledger', homepage: url('wp.test', '/') });
    assert.deepEqual(b.feeds.map((f) => f.url), [url('wp.test', '/feed/'), url('wp.test', '/atom.xml')]);
    assert.deepEqual(b.feeds[0], {
      url: url('wp.test', '/feed/'), format: 'rss', items: 4, newest: new Date(hoursAgo(2)).toISOString(),
      sampleTitles: ['Gurdon council & the water plant', 'Arkadelphia school board meets', 'Friday football'],
    });
    assert.equal(b.feeds[1].format, 'atom');
    assert.equal(b.paywall.level, 'metered');
    assert.match(b.paywall.evidence, /isAccessibleForFree: false, Zephr/);
    assert.deepEqual(b.suggest, { name: 'The Gurdon Ledger', kind: 'journalism', sections: ['local'], placeSlugs: ['arkadelphia-ar', 'gurdon-ar'] });
    assert.equal(b.existingSourceId, null);
    assert.equal(typeof b.message, 'string');
    // never asked for the comments feed
    assert.ok(!hits.some((h) => h.path === '/comments/feed/'));
  });

  test('no alternates: the platform paths, in order, until one parses', async () => {
    const res = await discover(url('plain.test', '/'));
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.deepEqual(res.body.feeds.map((f) => f.url), [url('plain.test', '/rss.xml')]);
    assert.deepEqual(hits.filter((h) => h.host === 'plain.test').map((h) => h.path), [
      '/', '/feed/', '/search/?f=rss&t=article&l=50', '/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', '/blog-feed.xml', '/rss', '/rss.xml', '/s1',
    ]);
    assert.equal(res.body.paywall.level, 'none');
    assert.deepEqual(res.body.suggest.sections, []);
  });

  test('the pasted URL is itself a feed: used as is; homepage from the channel link', async () => {
    const res = await discover(url('feedonly.test', '/news.rss'));
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.deepEqual(res.body.feeds.map((f) => f.url), [url('feedonly.test', '/news.rss')]);
    assert.deepEqual(res.body.site, { name: 'Feed Only Gazette', homepage: 'http://www.feedonly.test/' });
    assert.equal(res.body.paywall.level, 'hard');
    assert.equal(hostHits('feedonly.test'), 2); // the feed + one article
  });

  test('a detected platform goes first, and a CivicPlus .gov-less city is official', async () => {
    const res = await discover(url('city.test', '/'));
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.deepEqual(hits.filter((h) => h.host === 'city.test').map((h) => h.path).slice(0, 2), ['/', '/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml']);
    assert.equal(res.body.suggest.kind, 'official');
  });

  test(`no feed: ok:false with the plain message, inside the ${DISCOVERY_BUDGET}-request budget (redirect hops count)`, async () => {
    const res = await discover(url('nofeed.test', '/'));
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'NO_FEED');
    assert.equal(res.body.message, NO_FEED_MESSAGE);
    assert.deepEqual(res.body.feeds, []);
    assert.ok(hostHits('nofeed.test') <= DISCOVERY_BUDGET, `made ${hostHits('nofeed.test')} requests`);
    assert.ok(hostHits('nofeed.test') >= DISCOVERY_BUDGET - 1, 'used the budget on paths');
  });

  test('a guessed path never spends the request kept for the paywall check', async () => {
    const res = await discover(url('late.test', '/'));
    assert.equal(res.body.code, 'NO_FEED');
    assert.equal(hostHits('late.test'), DISCOVERY_BUDGET - 1);
    assert.ok(!hits.some((h) => h.path === '/rss'));
  });

  test('a publisher on the paywalled-domain list reads metered even when its markup is clean', async () => {
    const res = await discover(url('www.hotsr.com', '/feed/'));
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.equal(res.body.paywall.level, 'metered');
    assert.match(res.body.paywall.evidence, /paywalled-publisher list/);
  });

  test('existingSourceId: a discovered feed another source already has (case/trailing-slash variant)', async () => {
    const src = await Source.create({
      slug: 'ledger', name: 'Ledger', kind: 'journalism', status: 'active',
      feeds: [{ url: `HTTP://WP.TEST:${port}/feed#top` }],
    });
    const res = await discover(url('wp.test', '/'));
    assert.equal(res.body.existingSourceId, String(src._id));
  });
});

describe('POST /api/discover: the guard and the gate', () => {
  test('a private literal, a host resolving private, and a redirect to private are UNSAFE_URL — nothing fetched there', async () => {
    for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', `http://lan.test:${port}/`, url('redir.test', '/'), 'http://[::1]/', 'http://user:pw@wp.test/', `http://wp.test:22/`]) {
      const res = await discover(u);
      assert.equal(res.status, 400, u);
      assert.deepEqual(res.body, { ok: false, code: 'UNSAFE_URL', message: "That address isn't on the public internet." }, u);
    }
    assert.ok(!hits.some((h) => h.host !== 'redir.test'), JSON.stringify(hits));
  });

  test("the app's default discovery fetch is the production guard: even the fixture server is refused", async () => {
    const prodApp = createApp({ publicPath, validateSession, dbState: () => 1 });
    const before = hits.length;
    const res = await request(prodApp).post('/api/discover').set(auth('alice')).send({ url: `http://127.0.0.1:${port}/` });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNSAFE_URL');
    assert.equal(hits.length, before);
  });

  test('extra request fields cannot reach the guard', async () => {
    const res = await request(app).post('/api/discover').set(auth('alice'))
      .send({ url: 'http://127.0.0.1/', extraAllowedAddresses: ['127.0.0.1'], allow: true, resolve: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNSAFE_URL');
  });

  test('BAD_URL for junk and non-http schemes', async () => {
    for (const u of ['', 'ftp://wp.test/', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url at all', 'x'.repeat(2100)]) {
      const res = await discover(u);
      assert.equal(res.status, 400, u);
      assert.equal(res.body.code, 'BAD_URL', u);
    }
  });

  test('needs a signed-in user', async () => {
    const res = await request(app).post('/api/discover').send({ url: url('wp.test', '/') });
    assert.equal(res.status, 401);
    assert.equal(hits.length, 0);
  });

  test('30 discoveries per user per hour; per user; the window slides', async () => {
    for (let i = 0; i < 30; i += 1) assert.equal((await discover('')).status, 400);
    const blocked = await discover('');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await discover('', 'bob')).status, 400); // bob has his own count
    clockMs += 3600_000 + 1;
    assert.equal((await discover('')).status, 400);
  });

  test('CSRF: the frontend\'s cookie POST (Origin + X-CSRF-Token) passes; from another origin it is refused', async () => {
    const ok = await request(app).post('/api/discover')
      .set('Cookie', 'geek_token=alice; geek_csrf=tok').set('X-CSRF-Token', 'tok').set('Origin', 'https://newsgeek.clintgeek.com')
      .send({ url: '' });
    assert.equal(ok.status, 400); // reached the route (BAD_URL), not blocked
    const bad = await request(app).post('/api/discover').set('Cookie', 'geek_token=alice').set('Origin', 'https://evil.example').send({ url: url('wp.test', '/') });
    assert.equal(bad.status, 403);
    assert.equal(hostHits('wp.test'), 0);
  });
});

describe('discovery helpers', () => {
  test('bare domains become https; schemes kept; junk refused', () => {
    assert.equal(normalizeInputUrl('arkadelphian.com'), 'https://arkadelphian.com/');
    assert.equal(normalizeInputUrl('  www.hotsr.com/news#x '), 'https://www.hotsr.com/news');
    assert.equal(normalizeInputUrl('http://x.test/feed'), 'http://x.test/feed');
    assert.equal(normalizeInputUrl('//x.test/a'), 'https://x.test/a');
    for (const bad of ['', 'localhost', 'ftp://x.test', 'mailto:a@b.test']) assert.throws(() => normalizeInputUrl(bad), /./, bad);
  });

  test('suggestKind: .gov/.us/.mil/k12 hosts or CivicPlus are official', () => {
    for (const h of ['www.arkansas.gov', 'cityofgurdon.us', 'army.mil', 'gurdon.k12.ar.us', 'arkadelphia-k12.org']) assert.equal(suggestKind(h, null), 'official', h);
    assert.equal(suggestKind('cityofx.com', 'civicplus'), 'official');
    for (const h of ['arkadelphian.com', 'govnews.com', 'k12news.com']) assert.equal(suggestKind(h, null), 'journalism', h);
  });

  test('alternates and site names', () => {
    const html = `<link type="application/rss+xml" rel="alternate" href="/feed?a=1&amp;b=2"><link rel="alternate" type="text/html" href="/x"><link rel="ALTERNATE home" type="application/atom+xml" href='https://o.test/a.atom'>`;
    assert.deepEqual(extractAlternates(html, 'https://s.test/page'), ['https://s.test/feed?a=1&b=2', 'https://o.test/a.atom']);
    assert.equal(extractSiteName('<title>Home | The Daily Siftings</title>'), 'The Daily Siftings');
    assert.equal(extractSiteName('<meta content="Real Name" property="og:site_name"><title>x</title>'), 'Real Name');
  });

  test('paywall markers: each one, and the level', () => {
    assert.deepEqual(detectPaywall('<p>Free stuff</p>'), { level: 'none', markers: [] });
    assert.equal(detectPaywall('{"isAccessibleForFree":"False"}').level, 'hard');
    assert.equal(detectPaywall('<meta itemprop="isAccessibleForFree" content="false">').level, 'hard');
    assert.equal(detectPaywall('{"isAccessibleForFree": false} <script src="//cdn.zephr.com"></script>').level, 'metered');
    assert.equal(detectPaywall('<script src="https://experience.tinypass.com/x.js"></script>').level, 'metered');
    assert.equal(detectPaywall('<link href="/wp-content/plugins/cherryroad-paywall/x.css">').level, 'metered');
    assert.equal(detectPaywall('<div class="pmpro_content_message">Join</div>').level, 'hard');
    assert.equal(detectPaywall('This is premium content.').level, 'hard');
    assert.equal(detectPaywall('For subscribers-only').level, 'hard');
    assert.equal(detectPaywall('{"isAccessibleForFree": true}').level, 'none');
  });
});
