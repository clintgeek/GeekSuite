/**
 * Small concurrency helpers for the ingest worker and the purge.
 */

/**
 * Single-flight guard: `run()` refuses to start a second copy of `fn` while
 * one is still in flight (a slow tick must never overlap the next one, and
 * the purge's boot run must never collide with its first daily run).
 */
export function singleFlight(fn) {
  let running = null;
  return async (...args) => {
    if (running) return { skipped: true };
    running = (async () => fn(...args))();
    try {
      return await running;
    } finally {
      running = null;
    }
  };
}

/**
 * Run `worker(item)` over `items` with at most `concurrency` in flight in
 * total and at most ONE in flight per `keyOf(item)` (the feed's host — we
 * never hit one publisher with two requests at once). Items keep their order
 * as far as the per-key rule allows. Never rejects: a worker error is the
 * worker's to record; it is counted here and the pool moves on.
 *
 * @returns {Promise<{ done: number, failed: number }>}
 */
export function runPool(items, { concurrency = 4, keyOf = () => null, worker }) {
  const queue = [...items];
  const busy = new Set();
  let inFlight = 0;
  let done = 0;
  let failed = 0;
  return new Promise((resolve) => {
    const pump = () => {
      if (!queue.length && inFlight === 0) {
        resolve({ done, failed });
        return;
      }
      while (inFlight < concurrency) {
        const idx = queue.findIndex((it) => {
          const k = keyOf(it);
          return k == null || !busy.has(k);
        });
        if (idx === -1) break;
        const [item] = queue.splice(idx, 1);
        const key = keyOf(item);
        if (key != null) busy.add(key);
        inFlight += 1;
        Promise.resolve()
          .then(() => worker(item))
          .then(() => { done += 1; }, () => { failed += 1; })
          .finally(() => {
            if (key != null) busy.delete(key);
            inFlight -= 1;
            pump();
          });
      }
    };
    pump();
  });
}

export default { singleFlight, runPool };
