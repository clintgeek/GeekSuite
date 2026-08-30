/**
 * /api/health primitives.
 *
 * server.js can't be imported by a test (top-level await + app.listen), so the
 * logic behind the endpoint lives in lib/healthCheck.js and is tested here.
 *
 * The contract that matters operationally:
 *   - a degraded dependency returns 200, so uptime probes and Watchtower
 *     don't restart a container that is still serving
 *   - a critical dependency returns 503, so a real outage is visible
 *   - "unknown" is never treated as "down"
 *   - reading a probe never awaits, so a hung dependency cannot hang the
 *     health endpoint
 */

import { describe, it, expect, jest } from '@jest/globals';
import { summarizeDependencies, createCachedProbe, isDown } from '../lib/healthCheck.js';

describe('isDown', () => {
  it('only treats an explicit false as down', () => {
    expect(isDown(false)).toBe(true);
    expect(isDown(true)).toBe(false);
    expect(isDown(null)).toBe(false);      // unknown / unconfigured
    expect(isDown(undefined)).toBe(false);
  });
});

describe('summarizeDependencies', () => {
  it('reports ok/200 when everything is ready', () => {
    const result = summarizeDependencies({
      mongo: { ready: true, critical: true },
      redis: { ready: true },
    });
    expect(result).toEqual({ status: 'ok', httpStatus: 200, down: [] });
  });

  it('reports degraded with HTTP 200 when a non-critical dep is down', () => {
    const result = summarizeDependencies({
      mongo: { ready: true, critical: true },
      redis: { ready: false },
      aiGeek: { ready: false },
    });
    expect(result.status).toBe('degraded');
    expect(result.httpStatus).toBe(200);
    expect(result.down.sort()).toEqual(['aiGeek', 'redis']);
  });

  it('reports unhealthy with HTTP 503 when a critical dep is down', () => {
    const result = summarizeDependencies({
      mongo: { ready: false, critical: true },
      redis: { ready: true },
    });
    expect(result.status).toBe('unhealthy');
    expect(result.httpStatus).toBe(503);
    expect(result.down).toEqual(['mongo']);
  });

  it('treats the userGeek auth DB as critical', () => {
    const result = summarizeDependencies({
      mongo: { ready: true, critical: true },
      userGeek: { ready: false, critical: true },
    });
    expect(result.status).toBe('unhealthy');
    expect(result.httpStatus).toBe(503);
  });

  it('does not degrade on unknown / unconfigured dependencies', () => {
    const result = summarizeDependencies({
      mongo: { ready: true, critical: true },
      postgres: { ready: null, configured: false },
      influx: { ready: null, configured: false },
    });
    expect(result.status).toBe('ok');
    expect(result.down).toEqual([]);
  });

  it('handles an empty dependency map', () => {
    expect(summarizeDependencies({})).toEqual({ status: 'ok', httpStatus: 200, down: [] });
    expect(summarizeDependencies()).toEqual({ status: 'ok', httpStatus: 200, down: [] });
  });
});

describe('createCachedProbe', () => {
  it('stays unknown and never probes when disabled', () => {
    const probe = jest.fn();
    const p = createCachedProbe({ probe, enabled: false });
    expect(p.read()).toEqual({ ready: null, configured: false, checkedAt: null });
    expect(probe).not.toHaveBeenCalled();
  });

  it('returns unknown on the first read, then the probe result', async () => {
    const p = createCachedProbe({ probe: async () => true });
    // First read is synchronous — the probe has not landed yet.
    expect(p.read().ready).toBeNull();
    await p.refresh();
    expect(p.read().ready).toBe(true);
  });

  it('records a throwing probe as down and keeps the error message', async () => {
    const p = createCachedProbe({ probe: async () => { throw new Error('ECONNREFUSED'); } });
    await p.refresh();
    const state = p.read();
    expect(state.ready).toBe(false);
    expect(state.error).toBe('ECONNREFUSED');
  });

  it('treats a probe returning false as down', async () => {
    const p = createCachedProbe({ probe: async () => false });
    await p.refresh();
    expect(p.read().ready).toBe(false);
  });

  it('marks a probe that exceeds the timeout as down instead of hanging', async () => {
    const p = createCachedProbe({
      probe: () => new Promise(() => {}), // never settles
      timeoutMs: 20,
    });
    await p.refresh();
    const state = p.read();
    expect(state.ready).toBe(false);
    expect(state.error).toMatch(/timed out/);
  });

  it('read() is synchronous even when the probe is hung', () => {
    const p = createCachedProbe({ probe: () => new Promise(() => {}), timeoutMs: 50 });
    const started = Date.now();
    p.read();
    p.read();
    // No awaiting: a wedged dependency must not delay the health response.
    expect(Date.now() - started).toBeLessThan(20);
  });

  it('serves the cached result without re-probing while fresh', async () => {
    const probe = jest.fn(async () => true);
    const p = createCachedProbe({ probe, ttlMs: 60_000 });
    await p.refresh();
    p.read();
    p.read();
    p.read();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('re-probes once the cached result goes stale', async () => {
    let clock = 1_000;
    const probe = jest.fn(async () => true);
    const p = createCachedProbe({ probe, ttlMs: 100, now: () => clock });
    await p.refresh();
    expect(probe).toHaveBeenCalledTimes(1);

    clock += 500; // past the TTL
    p.read();
    await p.refresh();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent refreshes onto one in-flight probe', async () => {
    let resolveProbe;
    const probe = jest.fn(() => new Promise((resolve) => { resolveProbe = resolve; }));
    const p = createCachedProbe({ probe, ttlMs: 0 });
    const a = p.refresh();
    const b = p.refresh();
    p.read();
    expect(probe).toHaveBeenCalledTimes(1);
    resolveProbe(true);
    await Promise.all([a, b]);
    expect(p.read().ready).toBe(true);
  });

  it('recovers after a failure once the dependency comes back', async () => {
    let up = false;
    let clock = 0;
    const p = createCachedProbe({
      probe: async () => { if (!up) throw new Error('down'); return true; },
      ttlMs: 10,
      now: () => clock,
    });
    await p.refresh();
    expect(p.read().ready).toBe(false);

    up = true;
    clock += 100;
    p.read();
    await p.refresh();
    const state = p.read();
    expect(state.ready).toBe(true);
    expect(state.error).toBeUndefined();
  });
});
