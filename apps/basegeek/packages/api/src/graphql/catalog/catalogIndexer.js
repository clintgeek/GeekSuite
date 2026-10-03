/**
 * catalogIndexer.js — the background worker that keeps `gamevectors` and
 * `bookvectors` in step with the catalogs (MCP_SPEC D19).
 *
 * BookGeek's api and GameGeek's backend write the item collections directly,
 * so there are no save hooks to ride: a scan diffs every item's
 * `catalogHash(text, model)` against the stored vector's `hash`. New, edited
 * and deleted items all converge within one scan — a tag-only edit costs no
 * embed call (same hash), and a model change is a full re-embed, not a
 * migration.
 *
 * The loop mirrors the note indexer's: single-flight, a tick budget so a big
 * backfill spreads over scans (the to-do set is recomputed each tick — hash
 * skips make resuming free), embed batches ≤ BATCH_CHARS so a search query
 * never waits behind one giant request, and the shared `semantic.js`
 * service-health backoff — a down Ollama pauses notes and catalog alike.
 * Never on a request path.
 */

import logger from '../../lib/logger.js';
import { Book } from '../bookgeek/models/book.js';
import { Game } from '../gamegeek/models/game.js';
import { GameVector } from './models/GameVector.js';
import { BookVector } from './models/BookVector.js';
import { gameText, bookText, catalogHash } from './catalogText.js';
import { embedTexts, embeddingsConfig, EmbeddingsUnavailableError } from '../notegeek/embeddings.js';
import { markServiceDown, markServiceUp, serviceIsDown } from '../notegeek/semantic.js';
import { invalidateCatalogScope, invalidateCatalogVectors } from './catalogSemantic.js';
import { BATCH_CHARS, TICK_BUDGET_MS, STARTUP_DELAY_MS, TICK_MS } from '../notegeek/indexer.js';

export const SCAN_MS = 5 * 60 * 1000;

const log = logger.child({ module: 'catalog-indexer' });

/**
 * The two catalogs. `projection` is the lean read the diff needs — catalog
 * fields only, the same set `catalogText.js` consumes, so nothing heavy
 * (book files, game copies) is loaded just to be hashed.
 */
const KINDS = [
  {
    kind: 'book',
    Item: Book,
    Vector: BookVector,
    text: bookText,
    scope: () => 'books',
    projection: { title: 1, series: 1, authors: 1, publisher: 1, publishedDate: 1, description: 1, libraryTags: 1, myTags: 1 },
  },
  {
    kind: 'game',
    Item: Game,
    Vector: GameVector,
    text: gameText,
    scope: (item) => item.householdId,
    projection: {
      title: 1, series: 1, developers: 1, publishers: 1, releaseDate: 1,
      genres: 1, tags: 1, autoTags: 1, modes: 1, description: 1, householdId: 1,
    },
  },
];

function batches(items) {
  const out = [];
  let cur = [];
  let size = 0;
  for (const item of items) {
    const len = item.text.length + 64; // + the task prefix, with room to spare
    if (cur.length && size + len > BATCH_CHARS) { out.push(cur); cur = []; size = 0; }
    cur.push(item); size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * One kind, one scan: delete dead/old-model vectors, embed whatever the hash
 * diff says is missing or changed. Returns counts; throws only
 * EmbeddingsUnavailableError (the caller turns it into shared backoff).
 */
async function scanKind({ kind, Item, Vector, text, scope, projection }, model, deadline) {
  const items = await Item.find({}, projection).lean();
  const live = new Set(items.map((i) => String(i._id)));

  const stored = await Vector.find({ itemId: { $in: items.map((i) => i._id) } }, { itemId: 1, model: 1, hash: 1 }).lean();
  const currentHash = new Map(stored.filter((s) => s.model === model).map((s) => [String(s.itemId), s.hash]));

  // Vectors whose item is gone or whose model isn't current (D18/D19) —
  // including vectors for items never returned above.
  const { deletedCount: removed } = await Vector.deleteMany({
    $or: [{ itemId: { $nin: items.map((i) => i._id) } }, { model: { $ne: model } }],
  });

  const todo = items
    .map((item) => ({ item, text: text(item) }))
    .map((entry) => ({ ...entry, hash: catalogHash(entry.text, model) }))
    .filter((entry) => currentHash.get(String(entry.item._id)) !== entry.hash)
    // Empty text is worse than no vector: it would match everything faintly.
    .filter((entry) => entry.text.trim().length > 0);

  let embedded = 0;
  for (const batch of batches(todo)) {
    if (Date.now() > deadline) return { kind, embedded, removed, remaining: todo.length - embedded };
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose (one request at a time)
    const vectors = await embedTexts(batch.map((b) => b.text), { kind: 'document' });
    const ops = batch.map((entry, i) => ({
      replaceOne: {
        filter: { itemId: entry.item._id, model },
        replacement: {
          itemId: entry.item._id,
          ...(entry.item.householdId ? { householdId: entry.item.householdId } : {}),
          model,
          hash: entry.hash,
          vector: vectors[i],
          indexedAt: new Date(),
        },
        upsert: true,
      },
    }));
    // eslint-disable-next-line no-await-in-loop
    await Vector.bulkWrite(ops, { ordered: false });
    embedded += batch.length;
    new Set(batch.map((b) => scope(b.item))).forEach((s) => invalidateCatalogScope(kind, s));
  }
  return { kind, embedded, removed, remaining: 0 };
}

let running = false;

/**
 * One full scan (both kinds), exported for tests. Single-flight; shares the
 * note indexer's service-health backoff.
 * @returns {{ ran: boolean, kinds?: object[], reason?: string }}
 */
export async function runCatalogScanOnce({ budgetMs = TICK_BUDGET_MS } = {}) {
  if (running) return { ran: false, reason: 'busy' };
  if (serviceIsDown()) return { ran: false, reason: 'backoff' };
  running = true;
  const deadline = Date.now() + budgetMs;
  const kinds = [];
  // Kinds the deadline or the backoff kept us from reaching stay incomplete —
  // the scheduler uses `complete` to come back quickly instead of in 5 min.
  let complete = true;
  try {
    const { model } = embeddingsConfig();
    for (const spec of KINDS) {
      if (Date.now() > deadline) { complete = false; break; }
      try {
        // eslint-disable-next-line no-await-in-loop
        kinds.push(await scanKind(spec, model, deadline));
        markServiceUp();
      } catch (err) {
        if (err instanceof EmbeddingsUnavailableError) {
          const pause = markServiceDown(err);
          log.warn({ err: err.message, pauseMs: pause, kind: spec.kind }, 'embeddings unavailable; catalog scan paused');
          complete = false;
          break;
        }
        throw err;
      }
    }
  } finally {
    running = false;
  }
  if (kinds.some((k) => k.remaining > 0)) complete = false;
  const embedded = kinds.reduce((n, k) => n + k.embedded, 0);
  const removed = kinds.reduce((n, k) => n + k.removed, 0);
  if (embedded || removed) {
    log.info({ kinds: kinds.map((k) => ({ kind: k.kind, embedded: k.embedded, removed: k.removed, remaining: k.remaining })) }, 'catalog scan');
    invalidateCatalogVectors();
  }
  return { ran: true, kinds, complete };
}

/**
 * How long until the next scan (pure, for tests). An unfinished scan — work
 * left over, a deadline cut, a backoff — reschedules at the note indexer's
 * TICK_MS so a multi-thousand-item backfill is done in minutes, not a day.
 * Idle scans wait SCAN_MS. `serviceIsDown()` still gates the next run.
 */
export function nextScanDelay(result) {
  if (!result?.ran || !result.complete || result.kinds?.some((k) => k.remaining > 0)) return TICK_MS;
  return SCAN_MS;
}

let scanTimer = null;
let startTimer = null;

/** Start the chained loop. A no-op under test and when CATALOG_INDEXER=off. */
export function startCatalogIndexer() {
  if (process.env.NODE_ENV === 'test' || process.env.CATALOG_INDEXER === 'off') return false;
  if (scanTimer || startTimer) return true;
  const scan = async () => {
    let result = null;
    try {
      result = await runCatalogScanOnce();
    } catch (err) {
      log.error({ err }, 'catalog scan failed');
    }
    scanTimer = setTimeout(scan, nextScanDelay(result));
    scanTimer.unref?.();
  };
  startTimer = setTimeout(() => {
    startTimer = null;
    scan();
  }, STARTUP_DELAY_MS);
  startTimer.unref?.();
  log.info({ model: embeddingsConfig().model }, 'catalog indexer scheduled');
  return true;
}

export function stopCatalogIndexer() {
  [startTimer, scanTimer].forEach((t) => t && clearTimeout(t));
  startTimer = null; scanTimer = null;
}
