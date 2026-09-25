/**
 * Run `worker(item)` over `items` with at most `limit` in flight at once.
 * Used for the Steam import's background cover fetch (concurrency 3,
 * DOCS/GameGeekPlan.md §7) so it doesn't open dozens of simultaneous
 * connections to Steam/IGDB's cover CDNs.
 *
 * Errors from individual workers are swallowed (logged by the caller's
 * `worker`, if it wants to) — one failed cover must not stop the rest.
 */
export async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch {
        // Swallowed deliberately — see file header.
      }
    }
  });
  await Promise.all(runners);
}

export default { runWithConcurrency };
