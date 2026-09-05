// Unit tests for src/lib/breakers.js — DOCS/TODO_ORDER.md #23.
//
// Each test uses its own uniquely-named breaker (createBreaker's registry is
// module-level/shared, same as production) with a short timeout/resetTimeout
// so the suite doesn't have to wait out the real 30s production reset.

import { describe, test, expect, jest } from '@jest/globals';

import { createBreaker, breakerStats } from '../lib/breakers.js';

describe('lib/breakers', () => {
  test('createBreaker returns the same instance for a repeated name (shared circuit state)', () => {
    const name = `test-shared-${Date.now()}`;
    const a = createBreaker(name, (task) => task());
    const b = createBreaker(name, (task) => task());
    expect(a).toBe(b);
  });

  test('opens after threshold failures and the wrapped call then fails fast with the expected shape', async () => {
    const name = `test-open-${Date.now()}`;
    const upstream = jest.fn(() => Promise.reject(new Error('upstream boom')));
    const breaker = createBreaker(name, (task) => task(), {
      timeout: 100,
      errorThresholdPercentage: 50,
      resetTimeout: 500,
      volumeThreshold: 2,
    });

    await expect(breaker.fire(() => upstream())).rejects.toThrow('upstream boom');
    await expect(breaker.fire(() => upstream())).rejects.toThrow('upstream boom');

    expect(breaker.opened).toBe(true);

    // Once open, fire() must reject immediately with opossum's open-circuit
    // error and must NOT invoke the wrapped upstream call again — this is
    // the "fail fast" contract callers rely on to short-circuit before their
    // own axios timeout.
    upstream.mockClear();
    await expect(breaker.fire(() => upstream())).rejects.toMatchObject({
      code: 'EOPENBREAKER',
    });
    expect(upstream).not.toHaveBeenCalled();

    const stats = breakerStats();
    expect(stats[name].state).toBe('open');
    expect(stats[name].stats.failures).toBeGreaterThanOrEqual(2);
  });

  test('half-open probe after resetTimeout recovers the circuit to closed on success', async () => {
    const name = `test-halfopen-${Date.now()}`;
    const breaker = createBreaker(name, (task) => task(), {
      timeout: 100,
      errorThresholdPercentage: 50,
      resetTimeout: 150,
      volumeThreshold: 1,
    });

    await expect(breaker.fire(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(breaker.opened).toBe(true);
    expect(breakerStats()[name].state).toBe('open');

    // Wait past resetTimeout so opossum allows a half-open probe through.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const result = await breaker.fire(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.opened).toBe(false);
    expect(breakerStats()[name].state).toBe('closed');
  });

  test('breakerStats() shape matches what GET /api/health/breakers serves', () => {
    const name = `test-shape-${Date.now()}`;
    createBreaker(name, (task) => task(), {
      timeout: 100,
      errorThresholdPercentage: 50,
      resetTimeout: 100,
      volumeThreshold: 1,
    });

    const stats = breakerStats();
    expect(stats[name]).toEqual({
      state: expect.stringMatching(/^(open|halfOpen|closed)$/),
      stats: expect.objectContaining({
        fires: expect.any(Number),
        successes: expect.any(Number),
        failures: expect.any(Number),
        rejects: expect.any(Number),
        timeouts: expect.any(Number),
      }),
    });
  });
});
