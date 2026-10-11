/**
 * A sliding-window counter per key, IN MEMORY, per process.
 *
 * Used for discovery's 30-per-user-per-hour limit (DOCS/NEWSGEEK_PLAN.md
 * "Discovery"). NewsGeek runs one backend container, so per-process is the
 * whole fleet today. A restart (every main push restarts the fleet via
 * Watchtower) resets every counter — acceptable for an abuse brake on an
 * allowlist-free but signed-in-only endpoint. If NewsGeek ever runs more than
 * one replica, move this to Mongo.
 */
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map(); // key → ascending timestamps inside the window

  function prune(key, t) {
    const list = (hits.get(key) || []).filter((x) => x > t - windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  }

  return {
    /** Count one hit for `key` if under the limit. → { ok, retryAfterMs } */
    take(key) {
      const t = now();
      const list = prune(key, t);
      if (list.length >= limit) return { ok: false, retryAfterMs: Math.max(0, list[0] + windowMs - t) };
      list.push(t);
      hits.set(key, list);
      // Keep the map from growing without bound across many users.
      if (hits.size > 10_000) for (const k of [...hits.keys()]) prune(k, t);
      return { ok: true, retryAfterMs: 0 };
    },
  };
}

export default { createRateLimiter };
