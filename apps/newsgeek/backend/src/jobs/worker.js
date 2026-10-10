/**
 * The ingest worker — in-process, started by server.js.
 *
 * Every TICK_MS (60 s) it reads, FROM THE DATABASE, every `active` source
 * and polls each feed whose `nextPollAt` is null or due. Nothing that
 * matters lives in memory: a fleet restart (every main push restarts the
 * fleet via Watchtower) resumes from the feeds' stored state, and a poll cut
 * off mid-way is simply repeated (pollFeed's dedupe makes that safe). The
 * gateway's "check now" sets nextPollAt = now and the next tick picks it up.
 *
 *   - at most WORKER_CONCURRENCY feeds in flight (default 4);
 *   - at most ONE in flight per host (NPR's three feeds, Google News's five
 *     searches, go one after another);
 *   - ticks never overlap (single-flight): a slow tick swallows the next.
 *
 * Production only (or INGEST_AUTORUN=1); INGEST_DISABLED=1 is the kill
 * switch — the same shape as the purge's PURGE_* switches.
 */
import { singleFlight, runPool } from '../lib/concurrency.js';
import { buildPlaceMatcher } from '../ingest/places.js';
import { pollFeed } from '../ingest/pollFeed.js';
import { domainOf } from '../ingest/normalize.js';

export const TICK_MS = 60_000;

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return url; }
}

/** The feeds due at `at`, oldest-due first (never-polled feeds lead). */
export function dueFeeds(sources, at) {
  const due = [];
  for (const source of sources) {
    for (const feed of source.feeds || []) {
      if (!feed.nextPollAt || new Date(feed.nextPollAt) <= at) due.push({ source, feed });
    }
  }
  const key = (f) => (f.feed.nextPollAt ? new Date(f.feed.nextPollAt).getTime() : 0);
  return due.sort((a, b) => key(a) - key(b));
}

/**
 * Build a worker. `tick()` runs one pass (tests call it directly);
 * `start()` schedules it; `status()` feeds /api/health.
 */
export function createWorker({
  models,
  fetchImpl,
  fetchOptions,
  concurrency = 4,
  now = () => new Date(),
  log,
} = {}) {
  const { Source, Place } = models;
  const state = {
    enabled: false,
    running: false,
    lastTickAt: null,
    lastTickMs: null,
    lastTickError: null,
    activeSources: null,
    feedsDue: null,
    lastTickPolled: null,
    lastTickFailed: null,
  };
  let stopping = false;
  let current = null;

  async function pass() {
    const at = now();
    const [sources, places] = await Promise.all([
      Source.find({ status: 'active' }).lean(),
      Place.find({}, { slug: 1, name: 1, aliases: 1, parentId: 1, kind: 1 }).lean(),
    ]);
    const matcher = buildPlaceMatcher(places);
    // An aggregator item from a publisher we already read directly is a
    // duplicate: compare against every active non-aggregator homepage.
    const directDomains = [...new Set(sources.filter((s) => s.kind !== 'aggregator').map((s) => domainOf(s.homepage)).filter(Boolean))];
    const due = dueFeeds(sources, at);
    state.activeSources = sources.length;
    state.feedsDue = due.length;

    let polled = 0;
    let failed = 0;
    await runPool(due, {
      concurrency,
      keyOf: ({ feed }) => hostOf(feed.url),
      worker: async ({ source, feed }) => {
        if (stopping) return;
        try {
          const out = await pollFeed({ source, feed, models, matcher, directDomains, fetchImpl, fetchOptions, now, log });
          polled += 1;
          if (!out.ok) failed += 1;
        } catch (err) {
          // A database error mid-poll: the feed's state is untouched, so it
          // is due again next tick. Logged without the feed URL's query.
          failed += 1;
          log?.error({ event: 'feed_poll_error', source: source.slug, name: err?.name, code: err?.code }, 'feed poll errored');
        }
      },
    });
    state.lastTickPolled = polled;
    state.lastTickFailed = failed;
    return { activeSources: sources.length, due: due.length, polled, failed };
  }

  const tick = singleFlight(async () => {
    const started = Date.now();
    state.running = true;
    current = pass();
    try {
      const out = await current;
      state.lastTickError = null;
      if (out.due) log?.info({ event: 'ingest_tick', ...out, ms: Date.now() - started }, 'ingest tick');
      return out;
    } catch (err) {
      state.lastTickError = err?.name || 'Error';
      log?.error({ event: 'ingest_tick_failed', name: err?.name, code: err?.code }, 'ingest tick failed');
      return { error: true };
    } finally {
      state.running = false;
      state.lastTickAt = now();
      state.lastTickMs = Date.now() - started;
      current = null;
    }
  });

  let boot = null;
  let interval = null;

  return {
    tick,
    status: () => ({ ...state }),
    /**
     * @param {object} [opts]
     * @param {object} [opts.env]
     * @param {number} [opts.bootDelayMs]  first tick shortly after boot
     * @param {number} [opts.intervalMs]
     */
    start({ env = process.env, bootDelayMs = 5_000, intervalMs = TICK_MS } = {}) {
      const enabled = env.INGEST_DISABLED !== '1' && (env.NODE_ENV === 'production' || env.INGEST_AUTORUN === '1');
      state.enabled = enabled;
      if (!enabled) {
        log?.info({ event: 'ingest_schedule', enabled: false }, 'ingest worker off');
        return { enabled: false };
      }
      boot = setTimeout(tick, bootDelayMs);
      boot.unref();
      interval = setInterval(tick, intervalMs);
      interval.unref();
      log?.info({ event: 'ingest_schedule', enabled: true, intervalMs, concurrency }, 'ingest worker started');
      return { enabled: true };
    },
    /** Stop scheduling, start no new feed, and wait (bounded) for the in-flight tick. */
    async stop({ waitMs = 5_000 } = {}) {
      stopping = true;
      if (boot) clearTimeout(boot);
      if (interval) clearInterval(interval);
      if (current) {
        await Promise.race([current.catch(() => {}), new Promise((r) => { setTimeout(r, waitMs).unref(); })]);
      }
    },
  };
}

export default { createWorker, dueFeeds, TICK_MS };
