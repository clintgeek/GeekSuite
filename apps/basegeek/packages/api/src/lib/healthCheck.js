/**
 * Health-check primitives for GET /api/health.
 *
 * Two pieces, both deliberately dependency-free so they're unit-testable
 * without booting the server (server.js has top-level await + app.listen, so
 * it can't be imported by a test):
 *
 *   summarizeDependencies() — roll per-dependency readiness into one status
 *   createCachedProbe()     — non-blocking readiness for deps with no pool
 *
 * Design rule: the health endpoint must never await a dependency. Anything
 * that requires a network round-trip (Postgres, Influx) goes through a cached
 * probe that returns the LAST KNOWN result immediately and refreshes in the
 * background. A hung Postgres can therefore never hang the endpoint, which is
 * exactly the failure mode a liveness probe must survive.
 */

/**
 * Readiness tri-state:
 *   true   — dependency is up
 *   false  — dependency is down
 *   null   — unknown (not configured, or first probe hasn't landed yet)
 *
 * `null` must NOT count as down. Treating "we haven't checked yet" as a
 * failure would make every process report `degraded` for its first few
 * seconds of life, and would report `degraded` forever in deployments that
 * simply don't run Postgres or Influx.
 */
export function isDown(ready) {
  return ready === false;
}

/**
 * @param {Object<string, {ready: boolean|null, critical?: boolean}>} dependencies
 * @returns {{status: 'ok'|'degraded'|'unhealthy', httpStatus: 200|503, down: string[]}}
 *
 * Status semantics (unchanged from the original endpoint, and relied on by
 * uptime probes):
 *   ok         everything ready                          → 200
 *   degraded   a non-critical dependency is down         → 200
 *   unhealthy  a critical dependency is down             → 503
 *
 * 200-on-degraded matters: Watchtower and uptime checks must not restart or
 * page for a Redis blip when the app is still serving. 503-on-critical
 * likewise matters — it's the only way the endpoint can signal a real outage.
 */
export function summarizeDependencies(dependencies = {}) {
  const names = Object.keys(dependencies);
  const down = names.filter((name) => isDown(dependencies[name]?.ready));
  const criticalDown = down.filter((name) => dependencies[name]?.critical === true);

  let status = 'ok';
  if (criticalDown.length > 0) status = 'unhealthy';
  else if (down.length > 0) status = 'degraded';

  return { status, httpStatus: status === 'unhealthy' ? 503 : 200, down };
}

/**
 * Wrap an async readiness check in a non-blocking, TTL-cached probe.
 *
 * read() never awaits and never throws: it returns the cached result and, if
 * that result is older than ttlMs, kicks off a refresh whose outcome lands on
 * a later call. Concurrent refreshes are collapsed onto one in-flight promise,
 * so a slow dependency can't stack up connection attempts under probe load.
 *
 * @param {Object}   opts
 * @param {Function} opts.probe      async () => boolean (may throw = down)
 * @param {number}   [opts.ttlMs]    how long a result stays fresh
 * @param {number}   [opts.timeoutMs] hard cap on one probe attempt
 * @param {boolean}  [opts.enabled]  false → permanently unknown, never probes
 * @param {Function} [opts.now]      injectable clock (tests)
 */
export function createCachedProbe({
  probe,
  ttlMs = 30_000,
  timeoutMs = 2_000,
  enabled = true,
  now = Date.now,
} = {}) {
  let ready = null;
  let checkedAt = null;
  let error = null;
  let inflight = null;

  async function runProbe() {
    // Race the probe against a timer so a probe that never settles (a TCP
    // connect into a black hole) can't pin `inflight` open forever and
    // permanently wedge refreshes.
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs);
      if (typeof timer?.unref === 'function') timer.unref();
    });
    try {
      const result = await Promise.race([probe(timeoutMs), timeout]);
      ready = result !== false;
      error = null;
    } catch (err) {
      ready = false;
      error = err?.message || String(err);
    } finally {
      clearTimeout(timer);
      checkedAt = now();
      inflight = null;
    }
  }

  function refresh() {
    if (!enabled) return inflight;
    if (!inflight) inflight = runProbe();
    return inflight;
  }

  return {
    /** Synchronous. Returns last known state; schedules a refresh if stale. */
    read() {
      if (!enabled) return { ready: null, configured: false, checkedAt: null };
      if (checkedAt === null || now() - checkedAt > ttlMs) {
        // Fire and forget — errors are captured inside runProbe.
        refresh();
      }
      return {
        ready,
        configured: true,
        checkedAt: checkedAt === null ? null : new Date(checkedAt).toISOString(),
        ...(error ? { error } : {}),
      };
    },
    /** Await a completed probe. Used by tests; not by the request path. */
    refresh,
  };
}
