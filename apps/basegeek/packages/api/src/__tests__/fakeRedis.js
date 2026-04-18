/**
 * fakeRedis.js — minimal in-memory Redis double.
 *
 * Supports the subset of node-redis v4 API that refreshTokenStore.js uses:
 *   - connect() / quit() / on()
 *   - set(key, value, { EX }) / get(key) / del(key)
 *   - multi().get(k).del(k).exec()  → [value, 1]
 *
 * TTLs: implemented with setTimeout so tests don't need to advance timers.
 * For the auth tests TTL doesn't matter — tokens are consumed within the
 * same synchronous tick and real expiry is not tested here.
 */

export function makeFakeRedisClient() {
  const store = new Map(); // key → { value, timer }

  function _clearTimer(key) {
    const entry = store.get(key);
    if (entry && entry.timer) {
      clearTimeout(entry.timer);
    }
  }

  const client = {
    isOpen: true,

    async connect() {
      this.isOpen = true;
    },

    async quit() {
      // Clear all pending timers on shutdown
      for (const [, entry] of store) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      store.clear();
      this.isOpen = false;
    },

    on(_event, _handler) {
      // no-op — event subscription not needed for tests
      return this;
    },

    async set(key, value, opts = {}) {
      _clearTimer(key);
      let timer = null;
      if (opts.EX) {
        // setTimeout max is 2^31-1 ms (~24.8 days).  Tokens with a 30-day TTL
        // would overflow and fire immediately.  For tests, TTL precision is
        // irrelevant — we just flush between tests manually — so skip the timer
        // for any TTL that would overflow (> 24 days).
        const ms = opts.EX * 1000;
        const MAX_TIMEOUT_MS = 2 ** 31 - 1; // ~24.8 days
        if (ms <= MAX_TIMEOUT_MS) {
          timer = setTimeout(() => {
            store.delete(key);
          }, ms);
          // Allow the Node process to exit even if the timer is still pending.
          if (timer.unref) timer.unref();
        }
        // For TTLs > MAX_TIMEOUT_MS, the entry lives until flush() or quit().
      }
      store.set(key, { value, timer });
      return 'OK';
    },

    async get(key) {
      return store.get(key)?.value ?? null;
    },

    async del(key) {
      _clearTimer(key);
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    },

    /**
     * Returns a transaction-like builder whose exec() resolves with
     * [getResult, delResult] in the order the commands were queued.
     *
     * refreshTokenStore.consume() uses: multi().get(k).del(k).exec()
     */
    multi() {
      const cmds = [];
      const builder = {
        get(key) {
          cmds.push(async () => client.get(key));
          return builder;
        },
        del(key) {
          cmds.push(async () => client.del(key));
          return builder;
        },
        async exec() {
          const results = [];
          for (const cmd of cmds) {
            results.push(await cmd());
          }
          return results;
        },
      };
      return builder;
    },

    // Expose the internal store so tests can inspect/flush it
    _store: store,
    flush() {
      for (const [, entry] of store) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      store.clear();
    },
  };

  return client;
}
