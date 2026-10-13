/**
 * Books as ONE reader sees them (apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md).
 *
 * The catalog is one shared library; shelf, rating, review, dates, progress
 * and "my tags" are the caller's own `BookReading`. Every gateway read that
 * returns, filters, sorts or counts by a reader field goes through
 * `readerOverlay(userId)`, which writes the caller's values over the shared
 * row's under the same field names — so filters.js and library.js keep
 * matching `shelf` / `rating` / `dateFinished` unchanged, and another
 * reader's (or the legacy) values can never show through.
 *
 * Catalog-only reads (titles for search, tags for the vocabulary) don't
 * need this and don't use it.
 */
import mongoose from 'mongoose';
import { Book } from './models/book.js';
import { BookReading } from './models/bookReading.js';
import bookReadingModule from '@geeksuite/schemas/bookgeek/bookReading';

const { readerOverlay, splitReaderFields, upsertReading, READER_FIELDS } = bookReadingModule;

export { READER_FIELDS, splitReaderFields };

/** The overlay stages for `userId`, against this connection's collection. */
export function overlayFor(userId) {
  return readerOverlay(userId, { collection: BookReading.collection.name });
}

/**
 * `Book.find(match)` as the caller sees it. `match` may name reader fields.
 * A `prematch` (catalog-only) narrows BEFORE the overlay's per-book lookup.
 */
export async function findBooksFor(userId, match = {}, { prematch, sort, skip, limit, project } = {}) {
  const stages = [];
  if (prematch && Object.keys(prematch).length) stages.push({ $match: prematch });
  stages.push(...overlayFor(userId));
  if (match && Object.keys(match).length) stages.push({ $match: match });
  if (sort && Object.keys(sort).length) stages.push({ $sort: sort });
  if (skip) stages.push({ $skip: skip });
  if (limit) stages.push({ $limit: limit });
  if (project) stages.push({ $project: project });
  return Book.aggregate(stages);
}

/** `Book.countDocuments(match)` as the caller sees it. */
export async function countBooksFor(userId, match = {}) {
  const [row] = await Book.aggregate([...overlayFor(userId), { $match: match }, { $count: 'n' }]);
  return row?.n ?? 0;
}

/** One book as the caller sees it, or null. */
export async function findBookFor(userId, id) {
  const [book] = await Book.aggregate([{ $match: { _id: toId(id) } }, ...overlayFor(userId)]);
  return book ?? null;
}

function toId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** Upsert the caller's reader fields for a book. No-op when there are none. */
export function saveReading(userId, bookId, reader) {
  return upsertReading(BookReading, userId, toId(bookId), reader);
}

export { BookReading };
