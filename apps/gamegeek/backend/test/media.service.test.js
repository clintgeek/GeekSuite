/**
 * The media service (src/media/mediaService.js): the cache and its TTLs,
 * in-flight dedupe, the per-provider deadline, and partial results. Fake
 * fetchers and an in-memory store — no Mongo, no network.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMediaService,
  createMediaFetchers,
  mediaKey,
  mediaIds,
  MEDIA_TTL_MS,
  FAILURE_TTL_MS,
} from '../src/media/mediaService.js';

const SHOT = (src, n) => ({ thumb: `https://x/${src}${n}.jpg`, full: `https://x/${src}${n}-full.jpg`, source: src });

function memoryStore() {
  const map = new Map();
  return {
    map,
    gets: 0,
    sets: 0,
    async get(key) {
      this.gets += 1;
      return map.get(key) ?? null;
    },
    async set(key, entry) {
      this.sets += 1;
      map.set(key, structuredClone(entry));
    },
  };
}

function fakeFetchers({ steam, igdb, rawg, igdbConfigured = true, rawgConfigured = true } = {}) {
  const calls = { steam: 0, igdb: 0, rawg: 0 };
  const wrap = (name, impl) => async (id) => {
    calls[name] += 1;
    return typeof impl === 'function' ? impl(id) : impl;
  };
  return {
    calls,
    igdbConfigured: () => igdbConfigured,
    rawgConfigured: () => rawgConfigured,
    steam: wrap('steam', steam ?? { screenshots: [SHOT('steam', 1)], videos: [] }),
    igdb: wrap('igdb', igdb ?? { url: 'https://www.igdb.com/games/hk', screenshots: [SHOT('igdb', 1)], videos: [] }),
    rawg: wrap('rawg', rawg ?? 'hollow-knight'),
  };
}

const game = (externalIds) => ({ _id: 'g', externalIds });
const HK = { steamAppId: '367520', igdb: '14593', rawg: '9767' };

function clock(start = Date.UTC(2026, 9, 29)) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
  };
  return now;
}

describe('keys', () => {
  test('ids are validated; the key covers every provider id', () => {
    assert.deepEqual(mediaIds({ steamAppId: '367520', igdb: 'x; drop', rawg: 9767 }), { steamAppId: '367520', igdb: null, rawg: '9767' });
    assert.equal(mediaKey(mediaIds(HK)), 'steam:367520|igdb:14593|rawg:9767');
    assert.equal(mediaKey(mediaIds({})), null);
  });
});

describe('getMedia', () => {
  test('a game with no ids: no provider calls, no cache, empty media', async () => {
    const store = memoryStore();
    const fetchers = fakeFetchers();
    const svc = createMediaService({ store, fetchers, now: clock() });
    const media = await svc.getMedia(game({}));
    assert.deepEqual(media, { links: [], screenshots: [], videos: [], source: null, fetchedAt: null, partial: false, errors: [] });
    assert.deepEqual(fetchers.calls, { steam: 0, igdb: 0, rawg: 0 });
    assert.equal(store.gets, 0);
  });

  test('Steam preferred; IGDB URL and RAWG slug become links', async () => {
    const svc = createMediaService({ store: memoryStore(), fetchers: fakeFetchers(), now: clock() });
    const media = await svc.getMedia(game(HK));
    assert.equal(media.source, 'steam');
    assert.deepEqual(media.screenshots, [SHOT('steam', 1)]);
    assert.deepEqual(media.links.map((l) => l.kind), ['steam', 'igdb', 'rawg']);
    assert.equal(media.links[2].url, 'https://rawg.io/games/hollow-knight');
    assert.equal(media.partial, false);
    assert.equal(media.fetchedAt, new Date(Date.UTC(2026, 9, 29)).toISOString());
  });

  test('IGDB fills when Steam has nothing', async () => {
    const fetchers = fakeFetchers({ steam: { screenshots: [], videos: [] } });
    const media = await createMediaService({ store: memoryStore(), fetchers, now: clock() }).getMedia(game(HK));
    assert.equal(media.source, 'igdb');
    assert.deepEqual(media.screenshots, [SHOT('igdb', 1)]);
  });

  test('unconfigured IGDB/RAWG are never called', async () => {
    const fetchers = fakeFetchers({ igdbConfigured: false, rawgConfigured: false });
    const media = await createMediaService({ store: memoryStore(), fetchers, now: clock() }).getMedia(game(HK));
    assert.deepEqual(fetchers.calls, { steam: 1, igdb: 0, rawg: 0 });
    assert.deepEqual(media.links.map((l) => l.kind), ['steam']);
  });

  test('cached for 7 days: one provider fetch per game, refetched after expiry', async () => {
    const store = memoryStore();
    const fetchers = fakeFetchers();
    const now = clock();
    const svc = createMediaService({ store, fetchers, now });
    await svc.getMedia(game(HK));
    const [entry] = store.map.values();
    assert.equal(new Date(entry.expiresAt).getTime() - now(), MEDIA_TTL_MS);

    now.advance(MEDIA_TTL_MS - 1000);
    const again = await svc.getMedia(game(HK));
    assert.equal(fetchers.calls.steam, 1);
    assert.equal(again.links.length, 3); // links rebuilt from the cached URL/slug

    now.advance(2000);
    await svc.getMedia(game(HK));
    assert.equal(fetchers.calls.steam, 2);
  });

  test('a failure is cached briefly (15 min), not for a week', async () => {
    const store = memoryStore();
    const now = clock();
    const fetchers = fakeFetchers({
      steam: () => {
        throw Object.assign(new Error('Steam appdetails failed: 503'), { status: 503 });
      },
    });
    const svc = createMediaService({ store, fetchers, now, log: null });
    const media = await svc.getMedia(game(HK));
    assert.equal(media.partial, true);
    assert.deepEqual(media.errors, ['steam']);
    assert.equal(media.source, 'igdb'); // the rest still arrived
    const [entry] = store.map.values();
    assert.equal(new Date(entry.expiresAt).getTime() - now(), FAILURE_TTL_MS);

    await svc.getMedia(game(HK));
    assert.equal(fetchers.calls.steam, 1); // within the brief window: served from cache
    now.advance(FAILURE_TTL_MS + 1);
    await svc.getMedia(game(HK));
    assert.equal(fetchers.calls.steam, 2);
  });

  test('a provider past its deadline gives a partial answer instead of a slow one', async () => {
    const fetchers = fakeFetchers({ igdb: () => new Promise(() => {}) }); // never settles
    const svc = createMediaService({ store: memoryStore(), fetchers, now: clock(), deadlineMs: 30, log: null });
    const started = Date.now();
    const media = await svc.getMedia(game(HK));
    assert.ok(Date.now() - started < 1000);
    assert.equal(media.partial, true);
    assert.deepEqual(media.errors, ['igdb']);
    assert.deepEqual(media.screenshots, [SHOT('steam', 1)]);
    assert.deepEqual(media.links.map((l) => l.kind), ['steam', 'rawg']);
  });

  test('concurrent opens of the same game share one fetch', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const fetchers = fakeFetchers({ steam: async () => {
      await gate;
      return { screenshots: [SHOT('steam', 1)], videos: [] };
    } });
    const svc = createMediaService({ store: memoryStore(), fetchers, now: clock() });
    const a = svc.getMedia(game(HK));
    const b = svc.getMedia(game(HK));
    await new Promise((r) => setImmediate(r));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(fetchers.calls.steam, 1);
    assert.deepEqual(ra, rb);
  });

  test('a broken cache store never breaks the page', async () => {
    const store = {
      async get() {
        throw new Error('mongo down');
      },
      async set() {
        throw new Error('mongo down');
      },
    };
    const media = await createMediaService({ store, fetchers: fakeFetchers(), now: clock(), log: null }).getMedia(game(HK));
    assert.equal(media.source, 'steam');
  });
});

describe('createMediaFetchers (real clients, fake fetch)', () => {
  test('Steam: through the pacer, normalized; a 429 pauses the shared pacer', async () => {
    const scheduled = [];
    const paused = [];
    const pacer = { schedule: (fn) => (scheduled.push(1), fn()), pause: (ms) => paused.push(ms) };
    const ok = createMediaFetchers({
      steamPacer: pacer,
      fetchImpl: async () => ({ ok: true, json: async () => ({ 5: { success: true, data: { screenshots: [{ path_full: 'https://cdn.akamai.steamstatic.com/a.jpg' }] } } }) }),
    });
    assert.equal((await ok.steam('5')).screenshots.length, 1);
    assert.equal(scheduled.length, 1);

    const limited = createMediaFetchers({ steamPacer: pacer, fetchImpl: async () => ({ ok: false, status: 429 }) });
    await assert.rejects(() => limited.steam('5'), /429/);
    assert.equal(paused.length, 1);
  });
});
