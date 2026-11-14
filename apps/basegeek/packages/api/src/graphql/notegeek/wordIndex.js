/**
 * wordIndex.js — the one-time switch of NoteGeek word search from `content`
 * to `wordText` (AUTO_TRANSCRIBE_SPEC.md: "stop indexing raw sketch JSON").
 *
 * Mongo allows one text index per collection and can't change its fields in
 * place, so the old `{ title, content, tags }` index is dropped and the new
 * one created. Before that, notes written before `wordText` existed get it:
 * their content for every type but a sketch, nothing for a sketch (its
 * transcript arrives with sketchTranscript.js). Idempotent: on a deployment
 * that already has both, it reads the index list and does nothing.
 */
import Note, { WORD_INDEX_KEYS } from './models/Note.js';

const sameKeys = (idx) => Object.keys(idx.weights || {}).sort().join(',') === Object.keys(WORD_INDEX_KEYS).sort().join(',');

export async function ensureNoteWordIndex({ model = Note, log = null } = {}) {
  const coll = model.collection;
  const filled = await coll.updateMany(
    { type: { $ne: 'handwritten' }, wordText: { $exists: false } },
    [{ $set: { wordText: { $ifNull: ['$content', ''] } } }],
  );
  const sketches = await coll.updateMany({ type: 'handwritten', wordText: { $exists: false } }, { $set: { wordText: '' } });

  const textIndexes = (await coll.indexes()).filter((i) => i.key?._fts === 'text');
  let dropped = 0;
  for (const idx of textIndexes) {
    if (!sameKeys(idx)) {
      await coll.dropIndex(idx.name);
      dropped += 1;
    }
  }
  const created = !textIndexes.some(sameKeys);
  if (created) await coll.createIndex(WORD_INDEX_KEYS);
  const result = { filled: filled.modifiedCount, sketches: sketches.modifiedCount, dropped, created };
  if (log && (result.filled || result.sketches || dropped || created)) log.info(result, 'NoteGeek word index updated');
  return result;
}
