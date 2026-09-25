/**
 * Ported from apps/bookgeek/api/test/coverFetch.test.js for GameGeek's
 * generalized fetchImageBuffer (allowedHosts is now a caller-supplied
 * parameter — see src/lib/coverFetch.js's header). GameGeek's real
 * allow-list is src/metadata/coverHosts.js; these tests use a small fixture
 * list so the redirect/host tests read clearly on their own.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COVER_BYTES,
  MAX_COVER_REDIRECTS,
  fetchImageBuffer,
  isAllowedCoverHost,
} from '../src/lib/coverFetch.js';

const HOSTS = ['images.igdb.com', 'shared.akamai.steamstatic.com'];

describe('isAllowedCoverHost', () => {
  test('accepts hosts on the caller-supplied allow-list', () => {
    assert.ok(isAllowedCoverHost('https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg', HOSTS));
    assert.ok(isAllowedCoverHost('https://shared.akamai.steamstatic.com/x/y.jpg', HOSTS));
  });

  test('refuses a host not on the list', () => {
    assert.ok(!isAllowedCoverHost('https://evil.test/x.jpg', HOSTS));
  });

  test('refuses the SSRF targets that live on this box', () => {
    assert.ok(!isAllowedCoverHost('http://192.168.1.17:27018/', HOSTS));
    assert.ok(!isAllowedCoverHost('http://127.0.0.1:1810/api/health', HOSTS));
    assert.ok(!isAllowedCoverHost('http://datageek_mongodb:27017/', HOSTS));
    assert.ok(!isAllowedCoverHost('http://169.254.169.254/latest/meta-data/', HOSTS));
  });

  test('refuses a lookalike host that only ends with the allowed one', () => {
    assert.ok(!isAllowedCoverHost('https://evil-images.igdb.com/x.jpg', HOSTS));
    assert.ok(!isAllowedCoverHost('https://images.igdb.com.evil.test/x.jpg', HOSTS));
  });

  test('refuses non-http schemes', () => {
    assert.ok(!isAllowedCoverHost('file:///etc/passwd', HOSTS));
    assert.ok(!isAllowedCoverHost('gopher://images.igdb.com/', HOSTS));
  });

  test('refuses garbage rather than throwing', () => {
    assert.ok(!isAllowedCoverHost('not a url', HOSTS));
    assert.ok(!isAllowedCoverHost('', HOSTS));
    assert.ok(!isAllowedCoverHost(null, HOSTS));
  });
});

describe('fetchImageBuffer', () => {
  const okResponse = (bytes, headers = {}) => ({
    ok: true,
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

  test('requires an allowedHosts list', async () => {
    await assert.rejects(() => fetchImageBuffer('https://images.igdb.com/x.jpg', {}), TypeError);
  });

  test('returns the bytes on a normal answer', async () => {
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => okResponse([1, 2, 3]),
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.length, 3);
  });

  test('returns null on a non-2xx', async () => {
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => ({ ok: false, headers: { get: () => null } }),
    });
    assert.equal(buf, null);
  });

  test('refuses on a declared content-length over the cap without reading it', async () => {
    let read = false;
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => String(MAX_COVER_BYTES + 1) },
        arrayBuffer: async () => {
          read = true;
          return new ArrayBuffer(0);
        },
      }),
    });
    assert.equal(buf, null);
    assert.equal(read, false, 'must not buffer a body it already knows is too big');
  });

  test('refuses a body that exceeds the cap despite a lying header', async () => {
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => okResponse(new Array(MAX_COVER_BYTES + 1).fill(0), { 'content-length': '10' }),
    });
    assert.equal(buf, null);
  });

  test('returns null on an empty body', async () => {
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => okResponse([]),
    });
    assert.equal(buf, null);
  });

  test('returns null instead of throwing when the fetch rejects', async () => {
    const buf = await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.equal(buf, null);
  });

  test('passes an abort signal so a hung upstream cannot hold the handler', async () => {
    let sawSignal = false;
    await fetchImageBuffer('https://images.igdb.com/x.jpg', {
      allowedHosts: HOSTS,
      fetchImpl: async (_url, opts) => {
        sawSignal = opts?.signal instanceof AbortSignal;
        return okResponse([1]);
      },
    });
    assert.ok(sawSignal);
  });

  test('refuses a URL off the allow-list without making the request at all', async () => {
    let called = 0;
    const buf = await fetchImageBuffer('http://169.254.169.254/latest/meta-data/', {
      allowedHosts: HOSTS,
      fetchImpl: async () => {
        called += 1;
        return okResponse([1]);
      },
    });
    assert.equal(buf, null);
    assert.equal(called, 0, 'the allow-list is checked before the socket opens');
  });
});

describe('fetchImageBuffer redirects', () => {
  const okResponse = (bytes) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

  const redirectTo = (location, status = 302) => ({
    ok: false,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'location' ? location : null) },
    arrayBuffer: async () => {
      throw new Error('a redirect body must never be buffered');
    },
  });

  const START = 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg';

  test('asks for manual redirects, not follow', async () => {
    let mode = null;
    await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async (_url, opts) => {
        mode = opts?.redirect;
        return okResponse([1]);
      },
    });
    assert.equal(mode, 'manual');
  });

  test('refuses a redirect to a host off the allow-list, and stops there', async () => {
    const seen = [];
    const buf = await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async (url) => {
        seen.push(url);
        return redirectTo('http://169.254.169.254/latest/meta-data/');
      },
    });
    assert.equal(buf, null);
    assert.deepEqual(seen, [START], 'the hop must not be taken');
  });

  test('follows a redirect chain that stays on the allow-list', async () => {
    const seen = [];
    const buf = await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async (url) => {
        seen.push(url);
        if (url === START) return redirectTo('https://shared.akamai.steamstatic.com/x/y.jpg');
        return okResponse([1, 2, 3, 4]);
      },
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.length, 4);
    assert.deepEqual(seen, [START, 'https://shared.akamai.steamstatic.com/x/y.jpg']);
  });

  test('resolves a relative Location against the URL it came from', async () => {
    let last = null;
    const buf = await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async (url) => {
        last = url;
        if (url === START) return redirectTo('/igdb/image/upload/t_cover_big/def.jpg');
        return okResponse([9]);
      },
    });
    assert.equal(buf?.length, 1);
    assert.equal(last, 'https://images.igdb.com/igdb/image/upload/t_cover_big/def.jpg');
  });

  test('allows exactly MAX_COVER_REDIRECTS hops', async () => {
    let hops = 0;
    const buf = await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async () => {
        hops += 1;
        if (hops <= MAX_COVER_REDIRECTS) return redirectTo(`https://images.igdb.com/hop/${hops}`);
        return okResponse([7]);
      },
    });
    assert.equal(buf?.length, 1);
    assert.equal(hops, MAX_COVER_REDIRECTS + 1);
  });

  test('refuses a chain longer than MAX_COVER_REDIRECTS', async () => {
    let hops = 0;
    const buf = await fetchImageBuffer(START, {
      allowedHosts: HOSTS,
      fetchImpl: async () => {
        hops += 1;
        return redirectTo(`https://images.igdb.com/hop/${hops}`);
      },
    });
    assert.equal(buf, null);
    assert.equal(hops, MAX_COVER_REDIRECTS + 1, 'one initial request plus MAX_COVER_REDIRECTS hops, then stop');
  });

  test('treats every redirect status as a hop, 301 through 308', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      let hops = 0;
      const buf = await fetchImageBuffer(START, {
        allowedHosts: HOSTS,
        fetchImpl: async () => {
          hops += 1;
          if (hops === 1) return redirectTo('https://evil.test/x.jpg', status);
          return okResponse([1]);
        },
      });
      assert.equal(buf, null, `status ${status} must be re-validated`);
      assert.equal(hops, 1);
    }
  });
});
