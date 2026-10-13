'use strict';

/**
 * BookReading — one reader's relationship to one book.
 *
 * Spec: apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md. The catalog (`Book`) is
 * one shared library; a shelf, rating, review, dates, progress and "my tags"
 * belong to the person, not the book. No row means "unread, for you".
 *
 * Shared by basegeek's gateway and bookgeek's own API: both write
 * `bookreadings`, and both read books through `readerOverlay`, so the two
 * can't disagree about whose shelf a book is on.
 */

/** The Book fields that are really per-reader. Order is cosmetic. */
const READER_FIELDS = Object.freeze([
  'shelf',
  'rating',
  'review',
  'dateStarted',
  'dateFinished',
  'readCount',
  'readingProgress',
  'myTags',
]);

/** What a reader field reads as when the caller has no record of the book. */
const READER_DEFAULTS = Object.freeze({
  shelf: null,
  rating: null,
  review: null,
  dateStarted: null,
  dateFinished: null,
  readCount: 0,
  readingProgress: null,
  myTags: Object.freeze([]),
});

function assertMongoose(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/bookgeek/bookReading: pass your own mongoose instance');
  }
}

function bookReadingDefinition(mongoose) {
  assertMongoose(mongoose);
  return {
    userId: { type: String, required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    shelf: { type: String },
    rating: { type: Number, min: 0, max: 5 },
    review: { type: String },
    dateStarted: { type: Date },
    dateFinished: { type: Date },
    readCount: { type: Number, default: 0 },
    readingProgress: { type: Number, min: 0, max: 100 },
    myTags: [{ type: String }],
  };
}

const bookReadingSchemaOptions = Object.freeze({ timestamps: true });

function createBookReadingSchema(mongoose) {
  const schema = new mongoose.Schema(bookReadingDefinition(mongoose), { ...bookReadingSchemaOptions });
  schema.index({ userId: 1, bookId: 1 }, { unique: true });
  schema.index({ userId: 1, shelf: 1 });
  schema.index({ bookId: 1 });
  return schema;
}

/**
 * Aggregation stages that put the CALLER's reader fields onto each book,
 * under the same names the shared row used — so every `$match`, `$sort`
 * and facet written against `Book.shelf` / `Book.rating` keeps working.
 * The shared row's legacy values are always overwritten (with the caller's
 * value, or the default), so they can never show through to another reader.
 *
 * @param {string} userId the caller; required — there is no "anyone's" view
 * @param {{collection?: string}} [options]
 */
function readerOverlay(userId, { collection = 'bookreadings' } = {}) {
  if (!userId) throw new TypeError('readerOverlay: a userId is required');
  const uid = String(userId);
  const overlay = {};
  for (const field of READER_FIELDS) {
    const fallback = Array.isArray(READER_DEFAULTS[field]) ? [] : READER_DEFAULTS[field];
    overlay[field] = { $ifNull: [`$__reading.${field}`, fallback] };
  }
  return [
    {
      $lookup: {
        from: collection,
        let: { bid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$bookId', '$$bid'] }, { $eq: ['$userId', uid] }] } } },
          { $limit: 1 },
        ],
        as: '__reading',
      },
    },
    { $addFields: { __reading: { $arrayElemAt: ['$__reading', 0] } } },
    { $addFields: overlay },
    { $project: { __reading: 0 } },
  ];
}

/**
 * A book write, split: catalog fields for the shared `Book`, reader fields
 * for the caller's `BookReading`. Keys absent from `input` are absent from
 * both halves, so a partial update stays partial.
 */
function splitReaderFields(input = {}) {
  const catalog = {};
  const reader = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (READER_FIELDS.includes(key)) reader[key] = value;
    else catalog[key] = value;
  }
  return { catalog, reader };
}

/**
 * Apply a reader-fields patch to the caller's record (upsert). `$unset` for
 * explicit nulls so "clear my rating" really clears it.
 */
async function upsertReading(BookReading, userId, bookId, reader) {
  const keys = Object.keys(reader || {});
  if (!keys.length) return null;
  const $set = {};
  const $unset = {};
  for (const key of keys) {
    if (reader[key] === null || reader[key] === undefined) $unset[key] = '';
    else $set[key] = reader[key];
  }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return BookReading.findOneAndUpdate(
    { userId: String(userId), bookId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const isEmpty = (field, v) =>
  v === undefined || v === null || v === '' ||
  (field === 'readCount' && !(Number(v) > 0)) ||
  (Array.isArray(v) && v.length === 0);

/**
 * Two copies of one book are being merged: every reader's record on `fromId`
 * fills the EMPTY fields of that same reader's record on `toId` (never
 * overwriting what they already have there; `myTags` are unioned), then the
 * `fromId` records are deleted. Readers are never mixed — this is the
 * per-reader version of the old "fill the primary's blanks from the
 * secondary" rule both merge paths used on the shared row.
 *
 * @returns {Promise<number>} how many readers' records were moved or merged
 */
async function mergeReadings(BookReading, fromId, toId) {
  const from = await BookReading.find({ bookId: fromId }).lean();
  let merged = 0;
  for (const rec of from) {
    const existing = await BookReading.findOne({ userId: rec.userId, bookId: toId }).lean();
    const $set = {};
    for (const field of READER_FIELDS) {
      if (isEmpty(field, rec[field])) continue;
      if (field === 'myTags') {
        const union = [...new Set([...(existing?.myTags || []), ...rec.myTags])];
        if (union.length !== (existing?.myTags || []).length) $set.myTags = union;
      } else if (!existing || isEmpty(field, existing[field])) {
        $set[field] = rec[field];
      }
    }
    if (Object.keys($set).length) {
      await BookReading.updateOne({ userId: rec.userId, bookId: toId }, { $set }, { upsert: true });
      merged += 1;
    }
  }
  await BookReading.deleteMany({ bookId: fromId });
  return merged;
}

module.exports = {
  READER_FIELDS,
  READER_DEFAULTS,
  bookReadingDefinition,
  bookReadingSchemaOptions,
  createBookReadingSchema,
  readerOverlay,
  splitReaderFields,
  upsertReading,
  mergeReadings,
};
