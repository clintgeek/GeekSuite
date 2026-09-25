/**
 * Request pacing for enrichment (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Pacing).
 *
 * Steam's store API has no documented limit; roughly 200 requests per 5
 * minutes is what it tolerates. So every Steam store call enrichment makes —
 * search and appdetails alike, from the worker, a refresh, or the candidate
 * picker — goes through ONE pacer that starts calls at least 1.5 s apart,
 * and a 429 pushes the next start out by 60 s. IGDB (4/s) and RAWG (1/s)
 * have their limiters inside their clients.
 *
 * `now` and `sleep` are injectable so tests never wait on a real clock.
 */
export const STEAM_INTERVAL_MS = 1500;
export const STEAM_BACKOFF_MS = 60_000;

const realSleep = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });

/**
 * Calls scheduled through a pacer START at least `intervalMs` apart, in
 * order. The call itself runs outside the queue, so a slow response doesn't
 * hold up the spacing of the next one.
 */
export function createPacer({ intervalMs, now = Date.now, sleep = realSleep } = {}) {
  let nextAt = 0;
  let chain = Promise.resolve();

  function schedule(fn) {
    const turn = chain.then(async () => {
      const wait = nextAt - now();
      if (wait > 0) await sleep(wait);
      nextAt = Math.max(nextAt, now()) + intervalMs;
    });
    chain = turn.catch(() => {});
    return turn.then(fn);
  }

  /** Hold every future start until at least `ms` from now. */
  function pause(ms) {
    nextAt = Math.max(nextAt, now() + ms);
  }

  return { schedule, pause };
}

/**
 * Run `fn` through `pacer`; on an HTTP 429 pause the pacer by `backoffMs`
 * and try again, up to `retries` times, then rethrow.
 */
export async function pacedWithBackoff(pacer, fn, { backoffMs = STEAM_BACKOFF_MS, retries = 2, logger } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await pacer.schedule(fn);
    } catch (err) {
      if (err?.status !== 429 || attempt >= retries) throw err;
      logger?.warn?.({ backoffMs }, 'enrichment: provider answered 429, backing off');
      pacer.pause(backoffMs);
    }
  }
}

let steamPacer = null;

/** The process-wide Steam store pacer. */
export function getSteamPacer() {
  if (!steamPacer) steamPacer = createPacer({ intervalMs: STEAM_INTERVAL_MS });
  return steamPacer;
}

export default { createPacer, pacedWithBackoff, getSteamPacer, STEAM_INTERVAL_MS, STEAM_BACKOFF_MS };
