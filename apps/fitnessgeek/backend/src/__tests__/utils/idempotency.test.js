// The idempotency store behind contract C2: replay within the window, forget
// after it, prefer Redis when it is up, and never remember a 5xx.
import { describe, test, expect, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;
jest.unstable_mockModule(mod('../../config/logger.js'), () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() }
}));

const { createIdempotencyStore, usableKey } = await import('../../utils/idempotency.js');

const noRedis = { get: jest.fn(), set: jest.fn(), key: (...p) => p.join(':') };

describe('the window', () => {
  test('replays within ten minutes and runs again after', async () => {
    let clock = 0;
    const store = createIdempotencyStore({ now: () => clock, cache: noRedis, isRedisReady: () => false });
    const fn = jest.fn(async () => ({ status: 200, body: { n: fn.mock.calls.length } }));

    const first = await store.run('describe:u1', 'k1', fn);
    clock += 9 * 60 * 1000;
    const replay = await store.run('describe:u1', 'k1', fn);
    clock += 2 * 60 * 1000;
    const later = await store.run('describe:u1', 'k1', fn);

    expect(first).toEqual({ status: 200, body: { n: 1 }, replayed: false });
    expect(replay).toEqual({ status: 200, body: { n: 1 }, replayed: true });
    expect(later.replayed).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('a 4xx is the answer and is replayed; a 5xx is not remembered', async () => {
    const store = createIdempotencyStore({ cache: noRedis, isRedisReady: () => false });
    const nothing = jest.fn(async () => ({ status: 422, body: { code: 'NOTHING_TO_LOG' } }));
    await store.run('s', 'k-4xx-key', nothing);
    expect((await store.run('s', 'k-4xx-key', nothing)).replayed).toBe(true);

    const broken = jest.fn(async () => ({ status: 503, body: {} }));
    await store.run('s', 'k-5xx-key', broken);
    await store.run('s', 'k-5xx-key', broken);
    expect(broken).toHaveBeenCalledTimes(2);
  });

  test('keeps at most `max` answers, oldest out first', async () => {
    const store = createIdempotencyStore({ max: 2, cache: noRedis, isRedisReady: () => false });
    const fn = jest.fn(async () => ({ status: 200, body: {} }));
    await store.run('s', 'key-aaaa', fn);
    await store.run('s', 'key-bbbb', fn);
    await store.run('s', 'key-cccc', fn);
    await store.run('s', 'key-aaaa', fn);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe('Redis', () => {
  test('is where the answer lives when it is ready', async () => {
    const kept = new Map();
    const cache = {
      key: (...p) => p.join(':'),
      get: jest.fn(async (k) => kept.get(k) ?? null),
      set: jest.fn(async (k, v, ttl) => { kept.set(k, v); return ttl === 600; })
    };
    const store = createIdempotencyStore({ cache, isRedisReady: () => true });
    const fn = jest.fn(async () => ({ status: 200, body: { ok: 1 } }));

    await store.run('describe:u1', 'k-redis-1', fn);
    // A second process (or this one after a restart) sees it too.
    const other = createIdempotencyStore({ cache, isRedisReady: () => true });
    const replay = await other.run('describe:u1', 'k-redis-1', fn);

    expect(cache.set).toHaveBeenCalledWith('idempotency:describe:u1:k-redis-1', { status: 200, body: { ok: 1 } }, 600);
    expect(replay).toEqual({ status: 200, body: { ok: 1 }, replayed: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('usableKey', () => {
  test('a uuid is a key; junk is no key', () => {
    expect(usableKey('5f0c9a3e-1111-4222-8333-000000000001')).toBe('5f0c9a3e-1111-4222-8333-000000000001');
    expect(usableKey('')).toBeNull();
    expect(usableKey(undefined)).toBeNull();
    expect(usableKey('short')).toBeNull();
    expect(usableKey('has spaces in it ok')).toBeNull();
  });
});
