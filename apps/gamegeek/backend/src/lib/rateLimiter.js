/**
 * A small fixed-window rate limiter: at most `maxPerInterval` calls are
 * *started* per `intervalMs`, everything past that queues in order. Built
 * for IGDB's 4 req/s cap (DOCS/GameGeekPlan.md §4.2) — a single shared
 * queue so concurrent search requests from different users still add up to
 * one budget, matching what IGDB actually enforces.
 */
export function createRateLimiter({ maxPerInterval, intervalMs }) {
  let tokens = maxPerInterval;
  const queue = [];

  function drain() {
    while (tokens > 0 && queue.length > 0) {
      tokens -= 1;
      const { fn, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(fn)
        .then(resolve, reject);
    }
  }

  const timer = setInterval(() => {
    tokens = maxPerInterval;
    drain();
  }, intervalMs);
  timer.unref?.();

  /** @param {() => Promise<any>} fn */
  function schedule(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
  }

  return { schedule, stop: () => clearInterval(timer) };
}

export default { createRateLimiter };
