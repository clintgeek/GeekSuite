/**
 * One-time move of reader fields off the shared Book rows into Chef's
 * BookReading records (apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md §3.5).
 *
 * Chef decided 2026-10-13 that every shelf, rating, review, date, progress
 * and "my tags" value on the shared library today is his.
 *
 * - Runs ONCE: a marker in `migrations` says it has. Re-running would refill
 *   a rating he has since deliberately cleared.
 * - Merges per field (`$ifNull`): the server takes requests before this
 *   finishes, so a rating set in that first second wins over the legacy
 *   value instead of blocking the rest of the book's fields.
 * - Deprecate-first: the legacy fields stay on Book, untouched. Rolling back
 *   is redeploying the previous image; nothing here needs undoing.
 */
import bookReadingModule from '@geeksuite/schemas/bookgeek/bookReading';

const { READER_FIELDS } = bookReadingModule;

export const MIGRATION_ID = 'per-reader-shelves-v1';

/** Chef — the id DOCS/THINGGEEK_PLAN.md documents, and his FitnessGeek user_id. */
export const LEGACY_READER_ID = '6818c2bddcf626909f6a93a1';

const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');

/** The legacy reader fields a Book row actually carries, or null. */
export function legacyReaderValues(book) {
  const out = {};
  for (const field of READER_FIELDS) {
    if (field === 'readCount' ? Number(book[field]) > 0 : hasValue(book[field])) out[field] = book[field];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {{Book: import('mongoose').Model, BookReading: import('mongoose').Model,
 *          logger?: object, legacyUserId?: string, batchSize?: number}} deps
 * @returns {Promise<{skipped: boolean, books?: number, written?: number}>}
 */
export async function migrateReaderFields({ Book, BookReading, logger, legacyUserId = LEGACY_READER_ID, batchSize = 200 }) {
  const markers = BookReading.db.collection('migrations');
  if (await markers.findOne({ _id: MIGRATION_ID })) return { skipped: true };

  const projection = Object.fromEntries(READER_FIELDS.map((f) => [f, 1]));
  const cursor = Book.find({}, projection).lean().cursor();
  let ops = [];
  let books = 0;
  let written = 0;
  const flush = async () => {
    if (!ops.length) return;
    const res = await BookReading.bulkWrite(ops, { ordered: false });
    written += (res.upsertedCount || 0) + (res.modifiedCount || 0);
    ops = [];
  };

  for await (const book of cursor) {
    const values = legacyReaderValues(book);
    if (!values) continue;
    books += 1;
    const set = { userId: legacyUserId, bookId: book._id };
    for (const [field, value] of Object.entries(values)) {
      const legacy = { $literal: value };
      if (field === 'readCount') {
        // An early insert defaults readCount to 0, which $ifNull would keep.
        set[field] = { $max: [{ $ifNull: [`$${field}`, 0] }, legacy] };
      } else if (field === 'myTags') {
        // …and myTags to [], same problem: empty counts as unset.
        set[field] = { $cond: [{ $gt: [{ $size: { $ifNull: [`$${field}`, []] } }, 0] }, `$${field}`, legacy] };
      } else {
        set[field] = { $ifNull: [`$${field}`, legacy] };
      }
    }
    ops.push({
      updateOne: {
        filter: { userId: legacyUserId, bookId: book._id },
        update: [{ $set: { ...set, createdAt: { $ifNull: ['$createdAt', '$$NOW'] }, updatedAt: '$$NOW' } }],
        upsert: true,
      },
    });
    if (ops.length >= batchSize) await flush();
  }
  await flush();

  await markers.insertOne({ _id: MIGRATION_ID, doneAt: new Date(), books, written, legacyUserId });
  logger?.info?.({ books, written }, 'BookGeek: reader fields moved to BookReading');
  return { skipped: false, books, written };
}
