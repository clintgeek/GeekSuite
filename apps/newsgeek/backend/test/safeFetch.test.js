/**
 * src/lib/safeFetch.js — the SSRF guard (DOCS/NEWSGEEK_PLAN.md "Reader-added
 * sources", SSRF guard). Never the network: a local server on 127.0.0.1 is
 * reached only through a test-only allow-list, and hostnames resolve through
 * an injected resolver.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createSafeFetch, vetUrl, isPublicAddress, UnsafeUrlError, UNSAFE_URL_MESSAGE, BudgetExceededError,
} from '../src/lib/safeFetch.js';
import { fetchFeed, FetchError } from '../src/ingest/fetchFeed.js';

let server;
let port;
const seen = [];
before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/ok') return res.end('hello');
    if (u.pathname === '/redirect') {
      res.writeHead(302, { Location: u.searchParams.get('to') });
      return res.end();
    }
    if (u.pathname === '/loop') {
      const n = Number(u.searchParams.get('n') || 0);
      res.writeHead(301, { Location: `/loop?n=${n + 1}` });
      return res.end();
    }
    res.writeHead(404);
    return res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = String(server.address().port);
});
after(() => new Promise((r) => server.close(r)));

/** A resolver from a table; counts calls per host. */
function table(map) {
  const calls = {};
  const resolve = async (host) => {
    calls[host] = (calls[host] || 0) + 1;
    if (!(host in map)) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    return map[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  resolve.calls = calls;
  return resolve;
}

/** The guard as tests use it: local.test → 127.0.0.1 allowed on the server's port. */
function localFetch(map = {}) {
  const resolve = table({ 'local.test': ['127.0.0.1'], ...map });
  const f = createSafeFetch({ resolve, extraAllowedAddresses: ['127.0.0.1'], extraAllowedPorts: [port] });
  f.resolve = resolve;
  return f;
}

const refused = async (promise) => {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof UnsafeUrlError, `expected UnsafeUrlError, got ${err?.name}: ${err?.message}`);
    assert.equal(err.message, UNSAFE_URL_MESSAGE);
    return true;
  });
};

describe('address classes', () => {
  const PRIVATE = [
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
    '192.168.0.1', '192.168.255.255', '169.254.169.254', '100.64.0.1', '100.127.255.255',
    '0.0.0.0', '0.1.2.3', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    '192.0.2.1', '198.18.0.1', '198.51.100.7', '203.0.113.9',
    '::', '::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', 'ff0e::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe',
    '::127.0.0.1', '2001:db8::1', '64:ff9b::a00:1', '2002:c0a8:0101::1', '2001::1', '100::1',
    'not-an-ip', '', '1.2.3', '256.1.1.1',
  ];
  const PUBLIC = [
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '172.15.255.255', '100.128.0.1', '100.63.255.255',
    '169.253.0.1', '11.0.0.1', '2606:4700:4700::1111', '2a00:1450:4001::1', '::ffff:8.8.8.8',
    '64:ff9b::808:808', '2002:0808:0808::1',
  ];
  for (const a of PRIVATE) test(`refuses ${a || '(empty)'}`, () => assert.equal(isPublicAddress(a), false));
  for (const a of PUBLIC) test(`allows ${a}`, () => assert.equal(isPublicAddress(a), true));
});

describe('vetUrl: the URL itself', () => {
  const pub = table({ 'news.test': ['93.184.216.34'] });
  test('a public hostname passes and pins the resolved address', async () => {
    const v = await vetUrl('https://news.test/feed', { resolve: pub });
    assert.equal(v.address, '93.184.216.34');
    assert.equal(v.url.hostname, 'news.test');
  });

  test('every vetted address is kept for dialling, IPv4 first', async () => {
    const v = await vetUrl('https://dual.test/', { resolve: table({ 'dual.test': ['2606:4700::1', '93.184.216.34'] }) });
    assert.equal(v.address, '93.184.216.34');
    assert.deepEqual(v.addresses, [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1', family: 6 }]);
  });

  test('ports 80, 443, 8080 and the default pass; anything else is refused', async () => {
    for (const u of ['http://news.test/', 'https://news.test/', 'http://news.test:80/', 'https://news.test:443/', 'http://news.test:8080/']) {
      await vetUrl(u, { resolve: pub });
    }
    for (const u of ['http://news.test:22/', 'https://news.test:8443/', 'http://news.test:6379/', 'http://news.test:27017/']) {
      await refused(vetUrl(u, { resolve: pub }));
    }
  });

  test('only http and https', async () => {
    for (const u of ['ftp://news.test/x', 'file:///etc/passwd', 'gopher://news.test/', 'data:text/plain,hi', 'javascript:alert(1)', 'ws://news.test/']) {
      await refused(vetUrl(u, { resolve: pub }));
    }
  });

  test('credentials in the URL are refused', async () => {
    await refused(vetUrl('https://user:pw@news.test/', { resolve: pub }));
    await refused(vetUrl('https://user@news.test/', { resolve: pub }));
  });

  test('literal private IPs are refused, in every spelling the URL parser accepts', async () => {
    const never = async () => { throw new Error('a literal must not be resolved'); };
    for (const u of [
      'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1/',
      'http://172.20.0.1/', 'http://100.100.100.100/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
      'http://[fd00::1]/', 'http://[fe80::1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://127.1/',
    ]) {
      await refused(vetUrl(u, { resolve: never }));
    }
  });

  test('a hostname that resolves to a private address is refused', async () => {
    const r = table({
      'loop.test': ['127.0.0.1'], 'lan.test': ['192.168.0.10'], 'meta.test': ['169.254.169.254'],
      'cgnat.test': ['100.64.1.1'], 'v6.test': ['::1'], 'mapped.test': ['::ffff:10.0.0.1'], 'ula.test': ['fd00::5'],
      'localhost': ['127.0.0.1', '::1'],
    });
    for (const h of ['loop.test', 'lan.test', 'meta.test', 'cgnat.test', 'v6.test', 'mapped.test', 'ula.test', 'localhost']) {
      await refused(vetUrl(`https://${h}/`, { resolve: r }));
    }
  });

  test('EVERY resolved address must be public: one private among public ones refuses', async () => {
    const r = table({ 'mixed.test': ['93.184.216.34', '10.0.0.1'], 'mixed6.test': ['2606:4700::1', 'fe80::2'] });
    await refused(vetUrl('https://mixed.test/', { resolve: r }));
    await refused(vetUrl('https://mixed6.test/', { resolve: r }));
  });

  test('an unresolvable host is a network error, not a refusal', async () => {
    await assert.rejects(vetUrl('https://nx.test/', { resolve: table({}) }), (err) => err instanceof TypeError && err.cause.code === 'ENOTFOUND');
  });
});

describe('safeFetch: requests', () => {
  test('the default guard refuses the local server: no test hook, no fetch', async () => {
    const before = seen.length;
    const plain = createSafeFetch({ resolve: table({ 'local.test': ['127.0.0.1'] }) });
    await refused(plain(`http://127.0.0.1:${port}/ok`));
    await refused(plain('http://local.test/ok'));
    assert.equal(seen.length, before);
  });

  test('the test allow-list pairs address AND port: 127.0.0.1:80 and a public host on the test port stay refused', async () => {
    // vetUrl only: were this broken, nothing here may dial this machine's port 80.
    const opts = { resolve: table({ 'local.test': ['127.0.0.1'], 'pub.test': ['93.184.216.34'] }), extraAllowedAddresses: ['127.0.0.1'], extraAllowedPorts: [port] };
    await refused(vetUrl('http://127.0.0.1/ok', opts));
    await refused(vetUrl('http://local.test/ok', opts));
    await refused(vetUrl(`http://pub.test:${port}/ok`, opts));
    assert.equal((await vetUrl(`http://local.test:${port}/ok`, opts)).address, '127.0.0.1');
  });

  test('connects to the VETTED address: one lookup per hop, Host header keeps the name', async () => {
    // local.test is unknown to system DNS: if http.request looked it up again
    // (instead of using the pinned address) this would fail ENOTFOUND.
    const f = localFetch();
    const res = await f(`http://local.test:${port}/ok`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello');
    assert.equal(f.resolve.calls['local.test'], 1);
    assert.equal(seen.at(-1).host, `local.test:${port}`);
    assert.equal(res.url, `http://local.test:${port}/ok`);
  });

  test('follows redirects by hand, re-vetting each hop; res.url is the final URL', async () => {
    const f = localFetch({ 'other.test': ['127.0.0.1'] });
    const to = encodeURIComponent(`http://other.test:${port}/ok`);
    const res = await f(`http://local.test:${port}/redirect?to=${to}`);
    assert.equal(res.status, 200);
    assert.equal(res.url, `http://other.test:${port}/ok`);
    assert.equal(f.resolve.calls['other.test'], 1);
  });

  test('a redirect to a private address is refused before it is followed', async () => {
    const f = localFetch({ 'evil.test': ['127.0.0.2'] });
    const before = seen.length;
    // Every target is one that, were the guard broken, would only ever reach
    // this machine's loopback (nothing listens there) — never the LAN.
    for (const target of [
      `http://127.0.0.2:${port}/ok`, `http://evil.test:${port}/ok`, `http://[::1]:${port}/ok`, `http://[::ffff:127.0.0.3]:${port}/ok`,
      'file:///etc/passwd', `http://user:pw@local.test:${port}/ok`, 'http://local.test:1/',
    ]) {
      await refused(f(`http://local.test:${port}/redirect?to=${encodeURIComponent(target)}`));
    }
    // Only the redirecting requests themselves reached the server.
    assert.equal(seen.length - before, 7);
    assert.ok(seen.slice(before).every((s) => s.url.startsWith('/redirect')));
  });

  test('at most 5 redirects', async () => {
    const f = localFetch();
    const before = seen.length;
    await assert.rejects(f(`http://local.test:${port}/loop`), (err) => err instanceof TypeError && err.cause.code === 'ETOOMANYREDIRECTS');
    // 1 original + 5 followed = 6 requests, never a 7th.
    assert.deepEqual(seen.slice(before).map((x) => x.url), ['/loop', '/loop?n=1', '/loop?n=2', '/loop?n=3', '/loop?n=4', '/loop?n=5']);
  });

  test('a budget counts every hop and stops at zero', async () => {
    const f = localFetch();
    const budget = { remaining: 3 };
    await assert.rejects(f(`http://local.test:${port}/loop`, { budget }), BudgetExceededError);
    assert.equal(budget.remaining, 0);
  });
});

describe('fetchFeed uses the guard by default (the ingest worker)', () => {
  test('a feed URL on a private address fails as a FetchError with the plain message', async () => {
    const before = seen.length;
    await assert.rejects(
      fetchFeed({ url: `http://127.0.0.1:${port}/ok`, format: 'rss' }),
      (err) => err instanceof FetchError && err.message === UNSAFE_URL_MESSAGE,
    );
    await assert.rejects(
      fetchFeed({ url: 'http://localhost:1/feed', format: 'rss' }), // system DNS → loopback
      (err) => err instanceof FetchError && err.message === UNSAFE_URL_MESSAGE,
    );
    assert.equal(seen.length, before);
  });

  test('timeouts and body caps still apply through the guard', async () => {
    const f = localFetch();
    await assert.rejects(
      fetchFeed({ url: `http://local.test:${port}/ok`, format: 'rss' }, { fetchImpl: f, maxBytes: 2 }),
      (err) => err instanceof FetchError && /too large/.test(err.message),
    );
    const ok = await fetchFeed({ url: `http://local.test:${port}/ok`, format: 'rss' }, { fetchImpl: f });
    assert.equal(ok.body, 'hello');
  });
});
