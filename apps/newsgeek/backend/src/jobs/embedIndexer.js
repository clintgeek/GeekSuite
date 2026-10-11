/**
 * The embedding indexer — in-process, started by server.js beside the ingest
 * worker. N1 clustering, phase 1 (apps/newsgeek/DOCS/CLUSTERING.md).
 *
 * Every TICK_MS (60 s), single-flight, until TICK_BUDGET_MS is spent or the
 * queue is empty:
 *   1. read up to BATCH_SIZE (32) articles with no vector for the CURRENT
 *      model, NEWEST first (a backfill never delays today's stories);
 *   2. embed `title + '\n' + excerpt` (cluster/embeddings.js), split into
 *      requests of ≤ REQUEST_CHARS (4,000) so a NoteGeek search sharing the
 *      Ollama container never waits behind more than ~4 s of work;
 *   3. `$set` `embedding: { model, vector }` on each article — a targeted
 *      update by _id, nothing else touched, `updatedAt` left alone.
 *
 * The queue IS the database ("no vector for this model"), so a restart (every
 * main push) loses nothing, and a model change re-indexes everything in the
 * background.
 *
 * When the service is down/slow/refusing: the tick stops, the loop pauses
 * with doubling backoff (30 s → cap 10 min), ONE warning per outage and one
 * info line on recovery. Nothing is charged to the articles, nothing else is
 * called (no fallback provider), and ingest never notices — the two loops
 * share no timers and no state.
 *
 * A 400 (the input, not the service) is retried one article at a time; an
 * article that is refused on its own is set aside in memory for this process
 * (logged by id, never by text) and comes round again after a restart.
 *
 * Production only (or EMBED_AUTORUN=1); EMBED_DISABLED=1 is the kill switch —
 * the same shape as INGEST_* and PURGE_*.
 */
import { singleFlight } from '../lib/concurrency.js';
import {
  embedPassages, embeddingsConfig, articleText, EmbeddingsUnavailableError, MAX_CHARS_PER_REQUEST,
} from '../cluster/embeddings.js';

export const TICK_MS = 60_000;
export const BATCH_SIZE = 32;
/**
 * Characters per embed request (the batch of 32 is split to fit). NoteGeek
 * measured ~4 s for a 4,000-character request on this box (2026-09-30); its
 * search shares the container and waits behind at most one of ours. Under
 * the client's hard MAX_CHARS_PER_REQUEST guard.
 */
export const REQUEST_CHARS = Math.min(4000, MAX_CHARS_PER_REQUEST);
/** A tick stops starting new batches after this; a backfill is spread out. */
export const TICK_BUDGET_MS = 20_000;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;

/** Articles that have no vector for `model` (absent, empty, or another model's). */
export function missingFilter(model) {
  return {
    $or: [
      { 'embedding.model': { $ne: model } },
      { 'embedding.vector.0': { $exists: false } },
    ],
  };
}

/** Split texts (with their articles) into requests of ≤ maxChars characters each. */
export function splitByChars(items, maxChars = REQUEST_CHARS) {
  const out = [];
  let cur = []; let size = 0;
  for (const it of items) {
    const len = it.text.length;
    if (cur.length && size + len > maxChars) { out.push(cur); cur = []; size = 0; }
    cur.push(it); size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Doubling backoff for the n-th consecutive failure (n ≥ 1), capped. */
export function backoffMs(n, { base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS } = {}) {
  return Math.min(max, base * 2 ** Math.max(0, n - 1));
}

/**
 * Build the indexer. `tick()` runs one pass (tests call it directly);
 * `start()` schedules it; `status()` feeds /api/health.
 *
 * @param {object} args
 * @param {import('mongoose').Model} args.Article
 * @param {(texts: string[]) => Promise<{ model: string, vectors: number[][] }>} [args.embed]
 *   default: embedPassages against EMBEDDINGS_URL. Tests inject a fake.
 * @param {() => string} [args.currentModel]  default: EMBEDDINGS_MODEL or mxbai
 */
export function createEmbedIndexer({
  Article,
  embed = (texts) => embedPassages(texts),
  currentModel = () => embeddingsConfig().model,
  batchSize = BATCH_SIZE,
  maxCharsPerRequest = REQUEST_CHARS,
  tickBudgetMs = TICK_BUDGET_MS,
  backoff = { base: BACKOFF_BASE_MS, max: BACKOFF_MAX_MS },
  now = () => new Date(),
  clock = () => Date.now(),
  log,
} = {}) {
  const state = {
    enabled: false,
    running: false,
    model: null,
    lastRunAt: null,
    lastRunEmbedded: null,
    pending: null,
    lastError: null,
    backoffUntil: null,
  };
  let failures = 0;
  let outageStartedAt = null;
  const setAside = new Set(); // article ids the service refused on their own (400), this process only
  let stopping = false;
  let current = null;

  function serviceDown(err) {
    failures += 1;
    const pause = backoffMs(failures, backoff);
    state.backoffUntil = new Date(now().getTime() + pause);
    state.lastError = err?.message || err?.name || 'EmbeddingsUnavailableError';
    if (failures === 1) {
      outageStartedAt = now();
      log?.warn({ event: 'embed_unavailable', status: err?.status ?? null, pauseMs: pause }, 'embeddings unavailable; indexing paused');
    } else {
      log?.debug({ event: 'embed_unavailable', failures, pauseMs: pause }, 'embeddings still unavailable');
    }
  }

  function serviceUp() {
    if (failures > 0) {
      log?.info({ event: 'embed_recovered', failures, outageMs: now().getTime() - outageStartedAt.getTime() }, 'embeddings back; indexing resumed');
    }
    failures = 0;
    outageStartedAt = null;
    state.backoffUntil = null;
  }

  /** Embed one request's worth; on a 400, retry each article alone. Returns [{ id, vector }]. */
  async function embedGroup(group, model) {
    try {
      const out = await embed(group.map((g) => g.text));
      if (out.model !== model) throw new EmbeddingsUnavailableError(`embeddings answered with model ${out.model}, expected ${model}`);
      return group.map((g, i) => ({ id: g.id, vector: out.vectors[i] }));
    } catch (err) {
      if (!(err instanceof EmbeddingsUnavailableError) || !err.inputProblem) throw err;
      if (group.length === 1) {
        setAside.add(String(group[0].id));
        log?.warn({ event: 'embed_input_refused', articleId: String(group[0].id) }, 'embeddings refused one article; set aside until restart');
        return [];
      }
      const results = [];
      for (const g of group) {
        // One request at a time: the service is shared and serves one at a time.
        results.push(...await embedGroup([g], model));
      }
      return results;
    }
  }

  async function pass() {
    const model = currentModel();
    state.model = model;
    if (state.backoffUntil && now() < state.backoffUntil) {
      return { ran: false, reason: 'backoff', embedded: 0 };
    }
    const started = clock();
    const filter = missingFilter(model);
    let embedded = 0;
    let batches = 0;
    const seen = new Set();
    let serviceError = null;

    // At least one batch per tick; no new batch once the budget is spent.
    while (!stopping) {
      const exclude = [...setAside];
      const rows = await Article.find(exclude.length ? { ...filter, _id: { $nin: exclude } } : filter, { title: 1, excerpt: 1 })
        .sort({ publishedAt: -1 })
        .limit(batchSize)
        .lean();
      if (!rows.length) break;
      // The same article twice means its write did not land: stop rather than spin.
      if (rows.every((r) => seen.has(String(r._id)))) break;
      rows.forEach((r) => seen.add(String(r._id)));
      batches += 1;

      const items = rows.map((r) => ({ id: r._id, text: articleText(r) }));
      const results = [];
      try {
        for (const group of splitByChars(items, maxCharsPerRequest)) {
          // Sequential on purpose (Ollama serves one request at a time).
          results.push(...await embedGroup(group, model));
        }
      } catch (err) {
        if (!(err instanceof EmbeddingsUnavailableError)) throw err;
        serviceError = err;
      }
      if (results.length) {
        await Article.bulkWrite(results.map(({ id, vector }) => ({
          updateOne: { filter: { _id: id }, update: { $set: { embedding: { model, vector } } } },
        })), { ordered: false, timestamps: false });
        embedded += results.length;
        if (!serviceError) serviceUp();
      }
      if (serviceError) { serviceDown(serviceError); break; }
      if (clock() - started >= tickBudgetMs) break;
    }

    state.pending = await Article.countDocuments(filter);
    if (!serviceError) state.lastError = null;
    return { ran: true, embedded, batches, pending: state.pending, backoff: Boolean(serviceError) };
  }

  const tick = singleFlight(async () => {
    state.running = true;
    current = pass();
    try {
      const out = await current;
      state.lastRunEmbedded = out.embedded;
      if (out.embedded) log?.info({ event: 'embed_tick', embedded: out.embedded, batches: out.batches, pending: out.pending }, 'embedding tick');
      return out;
    } catch (err) {
      // A database error: nothing written for the failed batch; it comes round again.
      state.lastError = err?.name || 'Error';
      log?.error({ event: 'embed_tick_failed', name: err?.name, code: err?.code }, 'embedding tick failed');
      return { error: true };
    } finally {
      state.running = false;
      state.lastRunAt = now();
      current = null;
    }
  });

  let boot = null;
  let interval = null;

  return {
    tick,
    status: () => ({ ...state }),
    /** Exposed for tests and an operator's shell. */
    setAside: () => [...setAside],
    start({ env = process.env, bootDelayMs = 15_000, intervalMs = TICK_MS } = {}) {
      const enabled = env.EMBED_DISABLED !== '1' && (env.NODE_ENV === 'production' || env.EMBED_AUTORUN === '1');
      state.enabled = enabled;
      if (!enabled) {
        log?.info({ event: 'embed_schedule', enabled: false }, 'embedding indexer off');
        return { enabled: false };
      }
      boot = setTimeout(tick, bootDelayMs);
      boot.unref();
      interval = setInterval(tick, intervalMs);
      interval.unref();
      log?.info({ event: 'embed_schedule', enabled: true, intervalMs, batchSize }, 'embedding indexer started');
      return { enabled: true };
    },
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

export default { createEmbedIndexer, missingFilter, splitByChars, backoffMs, TICK_MS, BATCH_SIZE };
