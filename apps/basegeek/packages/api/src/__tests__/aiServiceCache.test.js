/**
 * aiService response-cache bounding tests.
 *
 * The cache is bounded on two axes and both have to hold, or a long-lived
 * process either serves stale completions forever (no TTL) or grows without
 * limit under prompt churn (no LRU). These tests drive the cache directly
 * through get/setCachedResponse — no provider HTTP is involved.
 *
 * The TTL tests below advance a fake clock (`jest.useFakeTimers()` +
 * `jest.advanceTimersByTime`) rather than sleeping on the real clock.
 * getCachedResponse/enforceCacheBounds compare against Date.now(), and
 * modern fake timers mock Date.now() too, so advancing the fake clock moves
 * the cache's notion of "now" deterministically. Real setTimeout-based
 * sleeps drifted under CPU contention (a nominal 40ms sleep can take much
 * longer on a loaded box), which made the tight-margin TTL cases
 * (e.g. ttlMs: 60 vs. two ~40ms waits) flake under a heavy parallel run.
 */

import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import aiService from '../services/aiService.js';

const original = { maxSize: aiService.maxCacheSize, ttlMs: aiService.cacheTtlMs };

beforeEach(() => {
  aiService.clearCache();
  aiService.cacheHits = 0;
  aiService.cacheMisses = 0;
  aiService.cacheExpirations = 0;
  aiService.cacheEvictions = 0;
  aiService.configureCache(original);
});

afterEach(() => {
  // Defensive: if a test throws after enabling fake timers but before it
  // restores real ones, don't let that leak into later tests/suites.
  jest.useRealTimers();
});

afterAll(() => {
  aiService.clearCache();
  aiService.configureCache(original);
});

describe('aiService cache — defaults', () => {
  it('boots with a bounded size and a finite TTL', () => {
    expect(aiService.maxCacheSize).toBe(500);
    expect(aiService.cacheTtlMs).toBe(30 * 60 * 1000);
    expect(Number.isFinite(aiService.maxCacheSize)).toBe(true);
    expect(Number.isFinite(aiService.cacheTtlMs)).toBe(true);
  });
});

describe('aiService cache — round trip', () => {
  it('stores and returns a string response as a normalized entry', () => {
    aiService.setCachedResponse('k1', 'hello');
    const hit = aiService.getCachedResponse('k1');
    expect(hit.content).toBe('hello');
    expect(hit.toolCalls).toBeNull();
    expect(hit.finishReason).toBe('stop');
    expect(typeof hit.timestamp).toBe('number');
  });

  it('preserves object responses including toolCalls', () => {
    const toolCalls = [{ id: 'c1', function: { name: 'read_file' } }];
    aiService.setCachedResponse('k2', { content: '', toolCalls, finishReason: 'tool_calls' });
    const hit = aiService.getCachedResponse('k2');
    expect(hit.toolCalls).toEqual(toolCalls);
    expect(hit.finishReason).toBe('tool_calls');
  });

  it('returns null and counts a miss for an unknown key', () => {
    expect(aiService.getCachedResponse('nope')).toBeNull();
    expect(aiService.getCacheStats().misses).toBe(1);
  });
});

describe('aiService cache — TTL expiration', () => {
  it('expires an entry once it is older than the TTL', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    aiService.configureCache({ ttlMs: 20 });
    aiService.setCachedResponse('stale', 'old answer');
    expect(aiService.getCachedResponse('stale')).not.toBeNull();

    jest.advanceTimersByTime(40);

    expect(aiService.getCachedResponse('stale')).toBeNull();
    const stats = aiService.getCacheStats();
    expect(stats.expirations).toBe(1);
    expect(stats.size).toBe(0); // expired entry is evicted, not just skipped
    jest.useRealTimers();
  });

  it('keeps entries that are still inside the TTL', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    aiService.configureCache({ ttlMs: 60_000 });
    aiService.setCachedResponse('fresh', 'new answer');
    jest.advanceTimersByTime(20);
    expect(aiService.getCachedResponse('fresh').content).toBe('new answer');
    expect(aiService.getCacheStats().expirations).toBe(0);
    jest.useRealTimers();
  });

  it('refreshes the timestamp when a key is overwritten', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    aiService.configureCache({ ttlMs: 60 });
    aiService.setCachedResponse('k', 'v1');
    jest.advanceTimersByTime(40);
    aiService.setCachedResponse('k', 'v2');
    jest.advanceTimersByTime(40); // 80ms since first write, 40ms since the overwrite
    expect(aiService.getCachedResponse('k')?.content).toBe('v2');
    jest.useRealTimers();
  });
});

describe('aiService cache — LRU eviction', () => {
  it('never exceeds maxCacheSize', () => {
    aiService.configureCache({ maxSize: 3 });
    for (let i = 0; i < 50; i++) aiService.setCachedResponse(`k${i}`, `v${i}`);
    expect(aiService.responseCache.size).toBe(3);
    expect(aiService.getCacheStats().evictions).toBe(47);
  });

  it('evicts the least-recently-used entry, not simply the oldest write', () => {
    aiService.configureCache({ maxSize: 3 });
    aiService.setCachedResponse('a', 'A');
    aiService.setCachedResponse('b', 'B');
    aiService.setCachedResponse('c', 'C');

    // Read 'a' — it becomes most-recently-used, so 'b' is now the LRU victim.
    expect(aiService.getCachedResponse('a')).not.toBeNull();

    aiService.setCachedResponse('d', 'D');

    expect(aiService.getCachedResponse('b')).toBeNull();
    expect(aiService.getCachedResponse('a')?.content).toBe('A');
    expect(aiService.getCachedResponse('c')?.content).toBe('C');
    expect(aiService.getCachedResponse('d')?.content).toBe('D');
  });

  it('does not evict a live entry when an existing key is overwritten', () => {
    aiService.configureCache({ maxSize: 2 });
    aiService.setCachedResponse('a', 'A');
    aiService.setCachedResponse('b', 'B');

    // Overwriting 'b' does not grow the cache, so nothing should be discarded.
    aiService.setCachedResponse('b', 'B2');

    expect(aiService.responseCache.size).toBe(2);
    expect(aiService.getCacheStats().evictions).toBe(0);
    expect(aiService.getCachedResponse('a')?.content).toBe('A');
    expect(aiService.getCachedResponse('b')?.content).toBe('B2');
  });

  it('reclaims expired entries before evicting live ones', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    aiService.configureCache({ maxSize: 2, ttlMs: 20 });
    aiService.setCachedResponse('old1', 'x');
    aiService.setCachedResponse('old2', 'y');
    jest.advanceTimersByTime(40); // both now expired

    aiService.configureCache({ maxSize: 1 });
    const stats = aiService.getCacheStats();
    expect(aiService.responseCache.size).toBe(1);
    // At least one slot was reclaimed as an expiration rather than an eviction.
    expect(stats.expirations).toBeGreaterThan(0);
    jest.useRealTimers();
  });
});

describe('aiService cache — configureCache', () => {
  it('shrinks the cache immediately when maxSize drops', () => {
    aiService.configureCache({ maxSize: 10 });
    for (let i = 0; i < 10; i++) aiService.setCachedResponse(`k${i}`, `v${i}`);
    expect(aiService.responseCache.size).toBe(10);

    aiService.configureCache({ maxSize: 4 });
    expect(aiService.responseCache.size).toBe(4);
  });

  it('ignores non-positive and unparseable values', () => {
    const before = { maxSize: aiService.maxCacheSize, ttlMs: aiService.cacheTtlMs };
    aiService.configureCache({ maxSize: 0, ttlMs: -1 });
    aiService.configureCache({ maxSize: 'banana', ttlMs: NaN });
    expect(aiService.maxCacheSize).toBe(before.maxSize);
    expect(aiService.cacheTtlMs).toBe(before.ttlMs);
  });
});

describe('aiService cache — stats', () => {
  it('reports size, bounds and counters', () => {
    aiService.configureCache({ maxSize: 2 });
    aiService.setCachedResponse('a', 'A');
    aiService.getCachedResponse('a');   // hit
    aiService.getCachedResponse('zzz'); // miss

    const stats = aiService.getCacheStats();
    expect(stats).toMatchObject({ size: 1, maxSize: 2, hits: 1, misses: 1 });
    expect(stats.ttlMs).toBe(aiService.cacheTtlMs);
    expect(stats.hitRate).toBe(50);
  });
});
