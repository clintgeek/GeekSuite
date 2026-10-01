/**
 * indexer.js — the background worker that keeps `noteChunks` in step with
 * the notes. Never on a request path: a save only flips `embeddingState` to
 * `stale` (Note model middleware); this loop does the slow part later.
 *
 * ## The loop
 *
 * Every TICK_MS, single-flight (a tick still running makes the next one a
 * no-op), one note at a time:
 *   1. pick the stale note whose last edit is OLDEST, among those untouched
 *      for QUIET_MS. Autosave fires every ~2 s while typing and bumps
 *      `updatedAt`, so a note being written is never picked; it is embedded
 *      once, ~30 s after the writer stops.
 *   2. chunk it (`chunking.js`); if the passages hash the same as last time
 *      (a tag edit, an undo back to the indexed text), mark it indexed with no
 *      embedding call at all.
 *   3. embed in small batches (≤ BATCH_CHARS), so a search's query never waits
 *      behind one giant request — Ollama serves one at a time.
 *   4. replace the note's chunks, then mark it indexed ONLY if `updatedAt` is
 *      still what we read. An edit that landed mid-embed leaves it stale and
 *      it goes round again.
 * A tick stops after TICK_BUDGET_MS so a backfill of a large library is
 * spread out, not one long CPU burst.
 *
 * ## Backfill
 *
 * Notes written before this existed have no `embeddingState`; the pick query
 * treats that as stale, so they are simply the queue's oldest entries. The
 * sweep (at start-up, then hourly) also re-queues any "indexed" note that has
 * no chunks of the current model (the collection was dropped, or the model
 * changed — see `sweepIndex`) and deletes chunks whose note is gone.
 *
 * ## When the service is down
 *
 * Saving and searching never notice. A connection error, timeout or 5xx
 * pauses the whole loop with doubling backoff (30 s → 15 min, shared with
 * search via `semantic.js`); the note is not charged. A 400 (the input was
 * the problem) charges the note: retry in 5 min × attempts, and `failed`
 * after MAX_NOTE_ATTEMPTS, visible in `noteIndexStatus`.
 */

import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import logger from '../../lib/logger.js';
import Note from './models/Note.js';
import NoteChunk from './models/NoteChunk.js';
import { chunkNote, chunksHash } from './chunking.js';
import { embedTexts, embeddingsConfig, EmbeddingsUnavailableError, MAX_CHARS_PER_REQUEST } from './embeddings.js';
import { invalidateUserVectors, markServiceDown, markServiceUp, serviceIsDown } from './semantic.js';

export const QUIET_MS = 30 * 1000;
export const TICK_MS = 10 * 1000;
export const TICK_BUDGET_MS = 25 * 1000;
export const STARTUP_DELAY_MS = 20 * 1000;
export const SWEEP_MS = 60 * 60 * 1000;
/** Characters per embed request: about one passage (~2 s of CPU here), so a
 * search query never queues behind more than that. Measured 2026-09-30: an
 * 1 873-word note in 4 000-char batches took 4 calls of ~4 s each. */
export const BATCH_CHARS = Math.min(2500, MAX_CHARS_PER_REQUEST);
export const MAX_NOTE_ATTEMPTS = 5;
const NOTE_RETRY_MS = 5 * 60 * 1000;
/** Types whose `content` has text worth reading. A sketch's is a tldraw snapshot. */
const TEXT_TYPES = ['markdown', 'text', 'code', 'mindmap'];

const log = logger.child({ module: 'notegeek-indexer' });

/** The queue: stale (or never indexed) notes, still for QUIET_MS, not waiting on a retry. */
export function dueFilter(now = Date.now()) {
  return {
    embeddingState: { $in: ['stale', null] },
    updatedAt: { $lte: new Date(now - QUIET_MS) },
    $or: [{ embeddingRetryAt: null }, { embeddingRetryAt: { $lte: new Date(now) } }],
  };
}

function batches(texts) {
  const out = [];
  let cur = []; let size = 0;
  for (const t of texts) {
    const len = t.length + 32; // + the task prefix, with room to spare
    if (cur.length && size + len > BATCH_CHARS) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

const setIndexState = (note, fields) => Note.updateOne(
  { _id: note._id, updatedAt: note.updatedAt },
  { $set: fields },
  { timestamps: false },
);

/**
 * Index one note (as read by the pick query, content included when it has
 * text). Returns what happened; throws only EmbeddingsUnavailableError for a
 * service-level failure, which the caller turns into backoff.
 */
export async function indexNote(note) {
  const { model } = embeddingsConfig();
  const chunks = chunkNote(note);
  const hash = chunksHash(chunks, model);

  if (!chunks.length) {
    await NoteChunk.deleteMany({ noteId: note._id });
    invalidateUserVectors(note.userId);
    await setIndexState(note, { embeddingState: 'skipped', embeddingHash: hash, embeddingError: null });
    return 'skipped';
  }
  if (hash === note.embeddingHash) {
    await setIndexState(note, { embeddingState: 'indexed', embeddingError: null, embeddingAttempts: 0 });
    return 'unchanged';
  }

  const vectors = [];
  for (const batch of batches(chunks)) {
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose (one request at a time)
    vectors.push(...await embedTexts(batch, { kind: 'document' }));
  }

  const ops = chunks.map((text, i) => ({
    replaceOne: {
      filter: { userId: note.userId, noteId: note._id, chunk: i },
      replacement: {
        userId: note.userId,
        noteId: note._id,
        chunk: i,
        text,
        textHash: createHash('sha256').update(text).digest('hex'),
        vector: vectors[i],
        model,
        updatedAt: new Date(),
      },
      upsert: true,
    },
  }));
  await NoteChunk.bulkWrite(ops, { ordered: false });
  // Rows past the new end. Together with the replace above (one row per
  // note + chunk, unique index) that is every old row, whatever model wrote it.
  await NoteChunk.deleteMany({ noteId: note._id, chunk: { $gte: chunks.length } });
  invalidateUserVectors(note.userId);

  // Deleted while we were embedding: take the rows back out.
  if (!(await Note.exists({ _id: note._id }))) {
    await NoteChunk.deleteMany({ noteId: note._id });
    return 'deleted';
  }
  const res = await setIndexState(note, {
    embeddingState: 'indexed', embeddingHash: hash, embeddingAttempts: 0, embeddingError: null, embeddingRetryAt: null,
  });
  return res.modifiedCount ? 'indexed' : 'raced';
}

async function pickNext(now) {
  const head = await Note.findOne(dueFilter(now), {
    _id: 1, userId: 1, title: 1, type: 1, isLocked: 1, isEncrypted: 1, updatedAt: 1, embeddingHash: 1, embeddingAttempts: 1,
  }).sort({ updatedAt: 1 }).lean();
  if (!head) return null;
  if (TEXT_TYPES.includes(head.type) && !head.isLocked && !head.isEncrypted) {
    const withBody = await Note.findById(head._id, { content: 1 }).lean();
    head.content = withBody?.content ?? '';
  }
  return head;
}

let running = false;

/**
 * One tick. Exported for tests and for an operator poking at a shell.
 * @returns {{ ran: boolean, results: string[], reason?: string }}
 */
export async function runIndexerOnce({ now = Date.now(), budgetMs = TICK_BUDGET_MS, maxNotes = Infinity } = {}) {
  if (running) return { ran: false, results: [], reason: 'busy' };
  if (serviceIsDown()) return { ran: false, results: [], reason: 'backoff' };
  running = true;
  const results = [];
  const started = Date.now();
  const seen = new Set();
  try {
    while (results.length < maxNotes && Date.now() - started < budgetMs) {
      // eslint-disable-next-line no-await-in-loop
      const note = await pickNext(now);
      // Picking the same note twice in one tick means its state write did not
      // land; stop rather than spin on it until the budget runs out.
      if (!note || seen.has(String(note._id))) break;
      seen.add(String(note._id));
      try {
        // eslint-disable-next-line no-await-in-loop
        results.push(await indexNote(note));
        markServiceUp();
      } catch (err) {
        if (err instanceof EmbeddingsUnavailableError && !err.inputProblem) {
          const pause = markServiceDown(err);
          log.warn({ err: err.message, pauseMs: pause }, 'embeddings unavailable; indexing paused');
          results.push('backoff');
          break;
        }
        const attempts = (note.embeddingAttempts || 0) + 1;
        const failed = attempts >= MAX_NOTE_ATTEMPTS;
        // eslint-disable-next-line no-await-in-loop
        await Note.updateOne({ _id: note._id }, {
          $set: {
            embeddingAttempts: attempts,
            embeddingError: String(err?.message || err).slice(0, 300),
            embeddingRetryAt: new Date(now + NOTE_RETRY_MS * attempts),
            ...(failed ? { embeddingState: 'failed' } : {}),
          },
        }, { timestamps: false });
        // The note id, never its text.
        log.warn({ noteId: String(note._id), attempts, failed, err: err?.message }, 'note could not be indexed');
        results.push('error');
      }
    }
  } finally {
    running = false;
  }
  if (results.length) log.info({ results: tally(results), ms: Date.now() - started }, 'indexer tick');
  return { ran: true, results };
}

function tally(results) {
  return results.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
}

/**
 * Housekeeping: chunks of notes that no longer exist go; "indexed" notes with
 * no chunks OF THE CURRENT MODEL go back in the queue; and another model's
 * chunks go once their note has the current model's.
 *
 * The middle rule is the whole model migration. Change EMBEDDINGS_MODEL (or
 * the default) and the start-up sweep finds every indexed note holding only
 * old-model chunks, marks it stale, and the loop re-embeds the library in the
 * background, oldest edit first. Search reads only current-model chunks
 * (`semantic.js`), so meanwhile it is keyword + whatever is already
 * re-embedded — never a mix of two models' scores, never an error.
 * `indexNote` replaces a note's rows by (note, chunk), so re-embedding a note
 * already removes its old-model rows; the third rule only catches strays.
 */
export async function sweepIndex() {
  const { model } = embeddingsConfig();
  const chunkNoteIds = await NoteChunk.distinct('noteId');
  const live = new Set((await Note.find({ _id: { $in: chunkNoteIds } }, { _id: 1 }).lean()).map((n) => String(n._id)));
  const orphans = chunkNoteIds.filter((id) => !live.has(String(id)));
  let removed = 0;
  if (orphans.length) {
    const orphanRows = await NoteChunk.find({ noteId: { $in: orphans } }, { userId: 1 }).lean();
    ({ deletedCount: removed } = await NoteChunk.deleteMany({ noteId: { $in: orphans } }));
    new Set(orphanRows.map((r) => String(r.userId))).forEach(invalidateUserVectors);
  }
  const currentIds = await NoteChunk.distinct('noteId', { model });
  const { deletedCount: oldModel } = await NoteChunk.deleteMany({ noteId: { $in: currentIds }, model: { $ne: model } });
  removed += oldModel;
  const { modifiedCount: requeued } = await Note.updateMany(
    { embeddingState: 'indexed', _id: { $nin: currentIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
    { $set: { embeddingState: 'stale', embeddingHash: null } },
    { timestamps: false },
  );
  if (removed || requeued) log.info({ removed, requeued, model }, 'index sweep');
  return { removed, requeued };
}

let tickTimer = null;
let sweepTimer = null;
let startTimer = null;

/** Start the loop. A no-op under test and when NOTEGEEK_INDEXER=off. */
export function startNoteIndexer() {
  if (process.env.NODE_ENV === 'test' || process.env.NOTEGEEK_INDEXER === 'off') return false;
  if (tickTimer || startTimer) return true;
  const safe = (fn, what) => () => fn().catch((err) => log.error({ err }, `${ what } failed`));
  startTimer = setTimeout(() => {
    startTimer = null;
    safe(sweepIndex, 'index sweep')();
    tickTimer = setInterval(safe(() => runIndexerOnce(), 'indexer tick'), TICK_MS);
    sweepTimer = setInterval(safe(sweepIndex, 'index sweep'), SWEEP_MS);
    tickTimer.unref?.();
    sweepTimer.unref?.();
  }, STARTUP_DELAY_MS);
  startTimer.unref?.();
  log.info({ model: embeddingsConfig().model }, 'notegeek indexer scheduled');
  return true;
}

export function stopNoteIndexer() {
  [startTimer].forEach((t) => t && clearTimeout(t));
  [tickTimer, sweepTimer].forEach((t) => t && clearInterval(t));
  startTimer = null; tickTimer = null; sweepTimer = null;
}
