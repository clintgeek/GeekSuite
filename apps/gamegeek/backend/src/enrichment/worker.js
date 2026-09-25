/**
 * The enrichment queue (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Running it).
 *
 * One process-local run at a time: run() while a run is going is a no-op.
 * A run walks the selectable games in `_id` order, one game at a time —
 * the pacing lives in the providers — and survives any single game's
 * failure. Progress lives only in the DB (`enrichment.status`), so a
 * restart simply resumes; a game that became selectable behind the cursor
 * is picked up by the next run (boot, every 6 h, after an import, or the
 * run endpoint).
 */
import { enrichGame } from './enrichGame.js';

/** Error retry backoff: attempts n → wait BASE × 2^(n-1) since lastTriedAt. */
export const ERROR_BACKOFF_BASE_MS = 10 * 60 * 1000;
export const MAX_ERROR_ATTEMPTS = 3;
const BATCH_SIZE = 50;

/**
 * The Mongo filter for "games the worker should try now".
 * @param {{configured: {steam: boolean, igdb: boolean, rawg: boolean}, now: Date}} params
 */
export function selectionFilter({ configured, now }) {
  const available = Object.entries(configured)
    .filter(([, on]) => on)
    .map(([name]) => name);
  const t = now.getTime();
  const errorClauses = [];
  for (let n = 0; n < MAX_ERROR_ATTEMPTS; n += 1) {
    const waitMs = n === 0 ? 0 : ERROR_BACKOFF_BASE_MS * 2 ** (n - 1);
    errorClauses.push({
      'enrichment.status': 'error',
      'enrichment.attempts': n,
      $or: [{ 'enrichment.lastTriedAt': null }, { 'enrichment.lastTriedAt': { $lte: new Date(t - waitMs) } }],
    });
  }
  return {
    'enrichment.manual': { $ne: true },
    $or: [
      { enrichment: null },
      { 'enrichment.status': 'pending' },
      ...errorClauses,
      // A miss is retried only when a provider it did not consult is now available.
      { 'enrichment.status': { $in: ['no-match', 'ambiguous'] }, 'enrichment.providersTried': { $not: { $all: available } } },
    ],
  };
}

const STATUS_COUNT_FILTERS = {
  matched: { 'enrichment.status': 'matched' },
  pending: { $or: [{ enrichment: null }, { 'enrichment.status': 'pending' }] },
  noMatch: { 'enrichment.status': 'no-match' },
  ambiguous: { 'enrichment.status': 'ambiguous' },
  error: { 'enrichment.status': 'error' },
  unlinked: { 'enrichment.status': 'unlinked' },
};

/**
 * @param {object} deps enrichGame's deps plus:
 *   isDisabled() → boolean (ENRICHMENT_DISABLED)
 */
export function createWorker(deps) {
  const { Game, providers, logger } = deps;
  const now = () => (deps.now ? deps.now() : new Date());

  let running = false;
  let current = null;
  let lastRunAt = null;
  let lastSummary = null;
  let donePromise = Promise.resolve(null);

  async function loop(trigger) {
    const tally = { trigger, processed: 0, matched: 0, noMatch: 0, ambiguous: 0, error: 0, skipped: 0, startedAt: now() };
    current = tally;
    let lastId = null;
    try {
      for (;;) {
        const filter = selectionFilter({ configured: providers.configured(), now: now() });
        if (lastId) filter._id = { $gt: lastId };
        const batch = await Game.find(filter, { _id: 1, householdId: 1 }).sort({ _id: 1 }).limit(BATCH_SIZE).lean();
        if (!batch.length) break;
        for (const ref of batch) {
          lastId = ref._id;
          if (deps.isDisabled?.()) break;
          try {
            const { outcome } = await enrichGame(ref, deps, { mode: 'worker' });
            tally.processed += 1;
            if (outcome === 'matched') tally.matched += 1;
            else if (outcome === 'no-match') tally.noMatch += 1;
            else if (outcome === 'ambiguous') tally.ambiguous += 1;
            else if (outcome === 'error') tally.error += 1;
            else tally.skipped += 1;
          } catch (err) {
            tally.processed += 1;
            tally.error += 1;
            logger?.error?.({ gameId: String(ref._id), err: err?.message }, 'enrichment: game failed');
          }
        }
        if (deps.isDisabled?.()) break;
      }
    } catch (err) {
      logger?.error?.({ err: err?.message }, 'enrichment: run aborted');
    } finally {
      const finishedAt = now();
      lastRunAt = finishedAt;
      lastSummary = { ...tally, finishedAt, durationMs: finishedAt - tally.startedAt };
      current = null;
      running = false;
      logger?.info?.(
        lastSummary,
        `enrichment run (${trigger}): ${tally.processed} processed, ${tally.matched} matched, ${tally.noMatch} no-match, ${tally.ambiguous} ambiguous, ${tally.error} error`
      );
    }
    return lastSummary;
  }

  /** Start a run unless one is going. Never throws, never blocks the caller. */
  function run({ trigger = 'manual' } = {}) {
    if (deps.isDisabled?.()) return { started: false, reason: 'disabled' };
    if (running) return { started: false, reason: 'running' };
    running = true;
    donePromise = loop(trigger);
    return { started: true };
  }

  /** Household-scoped status for the status endpoint. */
  async function status(householdId) {
    const scoped = (f) => ({ householdId, ...f });
    const entries = await Promise.all(
      Object.entries(STATUS_COUNT_FILTERS).map(async ([k, f]) => [k, await Game.countDocuments(scoped(f))])
    );
    const queued = await Game.countDocuments(scoped(selectionFilter({ configured: providers.configured(), now: now() })));
    return {
      running,
      queued,
      counts: Object.fromEntries(entries),
      providers: providers.configured(),
      lastRunAt,
      disabled: Boolean(deps.isDisabled?.()),
      progress: current ? { processed: current.processed, matched: current.matched, startedAt: current.startedAt } : null,
      lastRun: lastSummary,
    };
  }

  return {
    run,
    status,
    isRunning: () => running,
    /** Resolves when the current (or last) run finishes — for tests and shutdown. */
    whenIdle: () => donePromise,
  };
}

export default { createWorker, selectionFilter, ERROR_BACKOFF_BASE_MS, MAX_ERROR_ATTEMPTS };
