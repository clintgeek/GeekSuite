// Circuit breakers around fitnessgeek's external food/fitness upstreams
// (USDA, OpenFoodFacts, CalorieNinjas, Garmin). DOCS/TODO_ORDER.md #23.
//
// Each named upstream gets exactly ONE breaker (module-level registry, keyed
// by name) so that state — closed / open / half-open — is shared across
// every call site that hits that upstream, not just the one that happened
// to create it. Call sites that need to share a breaker across differently
// shaped calls (e.g. a search vs. a barcode lookup) should wrap a generic
// passthrough:
//
//   const usdaBreaker = createBreaker('usda', (task) => task());
//   ...
//   const response = await usdaBreaker.fire(() => axios.get(url, opts));
//
// Failures are left to the caller's existing try/catch — a breaker firing
// EOPENBREAKER is just another rejected promise, so services that already
// catch-and-degrade (return [] / null) keep doing exactly that, just faster,
// once the circuit is open. See each service file for the call sites.
import CircuitBreaker from 'opossum';
import logger from '../config/logger.js';

// Plain REST food-search APIs: axios already carries a 10s per-call timeout,
// so the breaker's own timeout (6s) trips first — a slow upstream fails
// fast instead of tying up the food-search fan-out for the full 10s.
const REST_DEFAULTS = {
  timeout: 6000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
};

// Garmin goes through the garmin-connect client library — a login plus
// several sequential calls per request — so it gets a longer allowance.
const GARMIN_DEFAULTS = {
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
};

const UPSTREAM_DEFAULTS = {
  usda: REST_DEFAULTS,
  nutritionix: REST_DEFAULTS, // no live call site today (grepped, not found) — reserved
  openfoodfacts: REST_DEFAULTS,
  calorieninjas: REST_DEFAULTS,
  garmin: GARMIN_DEFAULTS,
};

const registry = new Map();

/**
 * Create (or return the already-registered) circuit breaker for a named
 * upstream. `fn` is only used the first time a given `name` is created —
 * later calls return the existing instance so state stays shared, even if
 * multiple service files each call createBreaker(name, ...) at module load.
 *
 * @param {string} name - upstream key, e.g. 'usda', 'garmin'
 * @param {Function} fn - the function opossum wraps, typically a passthrough
 * @param {Object} [options] - opossum overrides layered on the per-upstream defaults
 * @returns {CircuitBreaker}
 */
function createBreaker(name, fn, options = {}) {
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }

  const defaults = UPSTREAM_DEFAULTS[name] || REST_DEFAULTS;
  const opts = { name, ...defaults, ...options };
  const breaker = new CircuitBreaker(fn, opts);

  breaker.on('open', () => logger.warn({ breaker: name }, 'Circuit breaker open'));
  breaker.on('halfOpen', () => logger.info({ breaker: name }, 'Circuit breaker half-open'));
  breaker.on('close', () => logger.info({ breaker: name }, 'Circuit breaker closed'));

  registry.set(name, breaker);
  return breaker;
}

function stateOf(breaker) {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'halfOpen';
  return 'closed';
}

/**
 * Snapshot stats for every registered breaker — backs GET /api/health/breakers.
 * Only breakers actually instantiated (i.e. the service module that owns
 * them has been required) appear here.
 */
function breakerStats() {
  const stats = {};
  for (const [name, breaker] of registry.entries()) {
    const s = breaker.stats;
    stats[name] = {
      state: stateOf(breaker),
      stats: {
        fires: s.fires,
        successes: s.successes,
        failures: s.failures,
        rejects: s.rejects,
        timeouts: s.timeouts,
      },
    };
  }
  return stats;
}

export { createBreaker, breakerStats };
export default { createBreaker, breakerStats };
