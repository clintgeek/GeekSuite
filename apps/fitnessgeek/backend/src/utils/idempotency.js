/**
 * Idempotency for writes a phone may send twice (contract C2).
 *
 * A describe that times out on the client has usually still written on the
 * server, so the client's retry used to log the meal a second time
 * (REVIEW_2026-10 P2). The client now sends one `Idempotency-Key` per press
 * and reuses it on a retry; the server answers the same user + key with the
 * first response again and writes nothing.
 *
 * Two layers:
 *   - IN FLIGHT: a duplicate that arrives while the first is still running
 *     waits on the same promise. This is per process, which is the whole
 *     deployment (one container).
 *   - DONE: the finished response, kept for `ttlMs`. In Redis when it is
 *     ready, so it survives a restart mid-retry; otherwise in a small
 *     in-process map with the same expiry, oldest evicted first.
 *
 * A 5xx is NOT remembered. "Could not log that. Try again." has to mean it:
 * replaying the failure for ten minutes would turn every retry into the same
 * error. A 2xx or 4xx is the answer to that request and is replayed.
 */

import cacheService from '../services/cacheService.js';
import redisClient from '../config/redis.js';
import logger from '../config/logger.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX = 1000;

/** A key worth honouring: a UUID, or anything like one. Anything else is ignored. */
export function usableKey(raw) {
  const key = typeof raw === 'string' ? raw.trim() : '';
  return /^[A-Za-z0-9_-]{8,128}$/.test(key) ? key : null;
}

/**
 * @param {{ttlMs?: number, max?: number, now?: () => number,
 *   cache?: {get: Function, set: Function, key: Function}, isRedisReady?: () => boolean}} [options]
 *   the overrides exist for tests.
 */
export function createIdempotencyStore({
  ttlMs = DEFAULT_TTL_MS,
  max = DEFAULT_MAX,
  now = () => Date.now(),
  cache = cacheService,
  isRedisReady = () => Boolean(redisClient.isReady())
} = {}) {
  const inFlight = new Map(); // id -> Promise<{status, body}>
  const local = new Map(); // id -> { at, response }, insertion-ordered for eviction

  const remembered = async (id) => {
    if (isRedisReady()) {
      const hit = await cache.get(cache.key('idempotency', id));
      if (hit) return hit;
    }
    const entry = local.get(id);
    if (!entry) return null;
    if (now() - entry.at >= ttlMs) {
      local.delete(id);
      return null;
    }
    return entry.response;
  };

  const remember = async (id, response) => {
    if (isRedisReady()) {
      const stored = await cache.set(cache.key('idempotency', id), response, Math.ceil(ttlMs / 1000));
      if (stored) return;
    }
    local.delete(id);
    local.set(id, { at: now(), response });
    while (local.size > max) local.delete(local.keys().next().value);
  };

  return {
    /**
     * Run `fn` once per (scope, key). `fn` resolves to `{status, body}`.
     * @returns {Promise<{status: number, body: any, replayed: boolean}>}
     */
    async run(scope, key, fn) {
      const id = `${scope}:${key}`;

      const running = inFlight.get(id);
      if (running) return { ...(await running), replayed: true };

      // Registered before the first await, so a duplicate arriving while the
      // stored-response lookup is still out waits on this one too.
      const attempt = (async () => {
        const previous = await remembered(id).catch(() => null);
        if (previous) return { ...previous, replayed: true };
        const response = await fn();
        if (response.status < 500) {
          await remember(id, { status: response.status, body: response.body }).catch((error) => {
            logger.warn({ err: error, scope }, 'Could not remember an idempotent response');
          });
        }
        return { ...response, replayed: false };
      })();
      inFlight.set(id, attempt);
      attempt.finally(() => inFlight.delete(id)).catch(() => {});

      return attempt;
    }
  };
}

export default createIdempotencyStore;
