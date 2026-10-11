/**
 * Publishing platforms that throttle us as ONE client (2026-10-11, plan
 * "Ingest hygiene"), and the poll-schedule jitter.
 *
 * Blox (TownNews) hosts hundreds of small papers. In production all six of
 * ours (Malvern Daily Record, Saline Courier, Ashley County Ledger, Log Cabin
 * Democrat, Magnolia Reporter, KTBS) answered 429: the platform rate-limits
 * us across its sites, so the per-host limiter doesn't help. Their feeds are
 * all `…/search/?f=rss…`. The worker treats every such feed as one host:
 * at most one in flight and at least BLOX_MIN_GAP_MS between consecutive
 * requests (in memory: a restart forgets the last request time, so the first
 * Blox request after a restart may come sooner than 90 s after the last one
 * before it — accepted), and their poll interval is at least
 * BLOX_MIN_POLL_MIN.
 */

export const BLOX_LIMIT_KEY = 'platform:blox';
export const BLOX_MIN_GAP_MS = 90_000;
export const BLOX_MIN_POLL_MIN = 60;
/** ± this fraction of the interval is added to every computed nextPollAt. */
export const JITTER_FRACTION = 0.1;

/** A Blox (TownNews) search feed: path `/search/` with `f=rss`. */
export function isBloxFeed(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  return /^\/search\/?$/.test(u.pathname) && u.searchParams.get('f') === 'rss';
}

/** The interval the worker actually uses: the feed's, floored for throttling platforms. */
export function effectivePollMin(feed) {
  const base = Math.max(1, Number(feed?.pollEveryMin) || 15);
  return isBloxFeed(feed?.url) ? Math.max(base, BLOX_MIN_POLL_MIN) : base;
}

/**
 * `jitter(ms)` → ms × (1 ± JITTER_FRACTION), uniformly. `random` is
 * injectable (tests): 0 → −10 %, 0.5 → exact, →1 → +10 %.
 */
export function makeJitter(random = Math.random, fraction = JITTER_FRACTION) {
  return (ms) => Math.round(ms * (1 + (2 * random() - 1) * fraction));
}

export const noJitter = (ms) => ms;

export default { isBloxFeed, effectivePollMin, makeJitter, noJitter, BLOX_LIMIT_KEY, BLOX_MIN_GAP_MS, BLOX_MIN_POLL_MIN, JITTER_FRACTION };
