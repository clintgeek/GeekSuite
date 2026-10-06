/**
 * A minimal per-request batcher (no dependency — the gateway has no
 * DataLoader). Field resolvers call `batchLoad(...)` in the same tick; the
 * first call schedules ONE `batchFn(keys)` for all of them, and each caller
 * gets its own key's value back. Scoped to the GraphQL context object, so a
 * batch never crosses requests (and therefore never crosses users).
 *
 * `batchFn(keys) => Promise<Map<key, value>>`; a missing key resolves to
 * `undefined`.
 */
const loaders = new WeakMap();

export function batchLoad(context, name, key, batchFn) {
  // No context object to scope to: degrade to an unbatched call.
  if (!context || typeof context !== 'object') {
    return batchFn([key]).then((m) => m.get(key));
  }
  let byName = loaders.get(context);
  if (!byName) {
    byName = new Map();
    loaders.set(context, byName);
  }
  let loader = byName.get(name);
  if (!loader) {
    loader = { pending: new Map(), scheduled: false };
    byName.set(name, loader);
  }
  return new Promise((resolve, reject) => {
    const waiters = loader.pending.get(key) || [];
    waiters.push({ resolve, reject });
    loader.pending.set(key, waiters);
    if (loader.scheduled) return;
    loader.scheduled = true;
    queueMicrotask(async () => {
      const batch = loader.pending;
      loader.pending = new Map();
      loader.scheduled = false;
      try {
        const results = await batchFn([...batch.keys()]);
        for (const [k, ws] of batch) ws.forEach((w) => w.resolve(results.get(k)));
      } catch (err) {
        for (const ws of batch.values()) ws.forEach((w) => w.reject(err));
      }
    });
  });
}
