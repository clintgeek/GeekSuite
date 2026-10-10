/**
 * src/lib/concurrency.js — the worker's pool: total cap and one-per-host.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { runPool, singleFlight } from '../src/lib/concurrency.js';

const tick = () => new Promise((r) => { setTimeout(r, 5); });

describe('runPool', () => {
  test('never more than `concurrency` in flight, never two for one key', async () => {
    const items = [
      { host: 'a' }, { host: 'a' }, { host: 'a' }, { host: 'b' }, { host: 'b' }, { host: 'c' }, { host: 'd' }, { host: 'e' },
    ];
    let inFlight = 0;
    let peak = 0;
    const perHost = new Map();
    let perHostPeak = 0;
    const out = await runPool(items, {
      concurrency: 3,
      keyOf: (it) => it.host,
      worker: async (it) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        perHost.set(it.host, (perHost.get(it.host) || 0) + 1);
        perHostPeak = Math.max(perHostPeak, perHost.get(it.host));
        await tick();
        perHost.set(it.host, perHost.get(it.host) - 1);
        inFlight -= 1;
      },
    });
    assert.deepEqual(out, { done: 8, failed: 0 });
    assert.equal(peak, 3);
    assert.equal(perHostPeak, 1);
  });

  test('a throwing worker is counted, the pool carries on', async () => {
    const out = await runPool([1, 2, 3], { worker: async (n) => { if (n === 2) throw new Error('x'); } });
    assert.deepEqual(out, { done: 2, failed: 1 });
  });

  test('empty input resolves', async () => {
    assert.deepEqual(await runPool([], { worker: async () => {} }), { done: 0, failed: 0 });
  });
});

describe('singleFlight', () => {
  test('a second call while one runs is skipped', async () => {
    let runs = 0;
    const run = singleFlight(async () => { runs += 1; await tick(); });
    const [a, b] = await Promise.all([run(), run()]);
    assert.equal(runs, 1);
    assert.deepEqual(b, { skipped: true });
    assert.equal(a, undefined);
  });
});
