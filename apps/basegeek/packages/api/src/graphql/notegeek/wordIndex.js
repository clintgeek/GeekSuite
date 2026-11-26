/**
 * wordIndex.js — NoteGeek word search's start-up housekeeping. Runs on every
 * gateway start (server.js; every push restarts the gateway) and is
 * idempotent: on a deployment that is already current it reads the index
 * list, counts nothing to do, and returns.
 *
 * 1. Derived fields. `wordText` (what the text index reads) and `preview`
 *    (a list row's text) come from noteDerived.js. Notes stamped with an
 *    older `derivedV` are re-derived here in batches: markup-free words for
 *    rich text, code and mind maps (Tier 5.3, 2026-11-15 — "target",
 *    "language", "label" used to match every such note), and the transcript
 *    for a sketch. Locked/encrypted rules as in noteDerived.js.
 * 2. `pinned` is written as false where it is missing, so a keyset page
 *    (notesPage) never meets two kinds of "not pinned" in one sort.
 * 3. The text index. Mongo allows one per collection and can't change its
 *    fields OR its weights in place, so a text index whose keys or weights
 *    differ from WORD_INDEX_KEYS / WORD_INDEX_WEIGHTS is dropped and the
 *    current one created. Between the drop and the create (well under a
 *    second for a library this size) `$text` queries fail; searchNotes
 *    answers that one moment with an empty keyword list rather than an error
 *    (resolvers.js). Mongoose's own autoIndex may race this: if it creates the
 *    new index first, the create below is a no-op; if it meets the old one it
 *    logs an IndexOptionsConflict and changes nothing.
 */
import Note, { WORD_INDEX_KEYS, WORD_INDEX_WEIGHTS } from './models/Note.js';
import { derivedFields, DERIVED_VERSION } from './noteDerived.js';

const sortedKeys = (o) => Object.keys(o || {}).sort().join(',');
const sameKeys = (idx) => sortedKeys(idx.weights) === sortedKeys(WORD_INDEX_KEYS);
const sameWeights = (idx) => Object.entries(WORD_INDEX_WEIGHTS).every(([k, w]) => Number(idx.weights?.[k]) === w);
export const isCurrentWordIndex = (idx) => sameKeys(idx) && sameWeights(idx);

const BATCH = 200;

/** Re-derive wordText/preview for every note below DERIVED_VERSION. Returns how many. */
export async function backfillDerived({ model = Note } = {}) {
  const coll = model.collection;
  let done = 0;
  // Bounded loop: each pass stamps what it read, so the next pass sees the rest.
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await coll.find(
      { $or: [{ derivedV: { $exists: false } }, { derivedV: { $lt: DERIVED_VERSION } }] },
      { projection: { type: 1, title: 1, content: 1, sketchTranscript: 1, isLocked: 1, isEncrypted: 1 } },
    ).limit(BATCH).toArray();
    if (!rows.length) break;
    // eslint-disable-next-line no-await-in-loop
    await coll.bulkWrite(rows.map((n) => ({
      updateOne: { filter: { _id: n._id }, update: { $set: derivedFields({ type: 'markdown', ...n }) } },
    })), { ordered: false });
    done += rows.length;
    if (rows.length < BATCH) break;
  }
  return done;
}

export async function ensureNoteWordIndex({ model = Note, log = null } = {}) {
  const coll = model.collection;
  const derived = await backfillDerived({ model });
  const pinned = await coll.updateMany({ pinned: { $exists: false } }, { $set: { pinned: false } });

  const textIndexes = (await coll.indexes()).filter((i) => i.key?._fts === 'text');
  let dropped = 0;
  for (const idx of textIndexes) {
    if (!isCurrentWordIndex(idx)) {
      // eslint-disable-next-line no-await-in-loop
      await coll.dropIndex(idx.name);
      dropped += 1;
    }
  }
  const created = !textIndexes.some(isCurrentWordIndex);
  if (created) await coll.createIndex(WORD_INDEX_KEYS, { weights: WORD_INDEX_WEIGHTS });
  const result = { derived, pinned: pinned.modifiedCount, dropped, created };
  if (log && (derived || result.pinned || dropped || created)) log.info(result, 'NoteGeek word index updated');
  return result;
}
