/**
 * bookgeek `Book` — the household library entry. Single source of truth for
 * the field set.
 *
 * Two writers share the `bookgeek.books` collection:
 *   1. basegeek's GraphQL gateway (graphql/bookgeek/models/book.js) — all
 *      plain data: create, update, delete, shelves, the library list.
 *   2. bookgeek's own API (apps/bookgeek/api/src/models/book.js) — bytes and
 *      long jobs: files, covers, enrich, merge, imports, Kindle, baskets.
 *
 * Until 2026-09-25 each side hand-copied this schema. Mongoose strict mode
 * silently DROPS a path its schema doesn't declare on `$set`, so a field added
 * to one copy only would be accepted by the other writer, answered with a
 * success, and never persisted. Both models now build from this factory.
 * Add a field here, never in either model. The tripwires are
 * `apps/basegeek/packages/api/src/__tests__/bookgeekSchemaParity.test.js` and
 * `apps/bookgeek/api/test/sharedSchema.test.js`.
 *
 * Reproduces the two hand-kept copies exactly as they stood at 48a1397a:
 * no indexes, no virtuals, no toJSON options, `timestamps: true`, and the
 * `files`/`series` sub-documents without their own `_id`.
 *
 * 2026-09-26 (tags, apps/bookgeek/DOCS/TAGS.md): `libraryTags`,
 * `unsortedTags` and `myTags` added — additive; old documents lack them until
 * the api's boot migration derives the first two.
 *
 * 2026-11-15 (S-D5, Recently deleted): `deletedAt`, `deletedBy`,
 * `deleteFilesOnPurge` added — additive — plus the `hideDeletedBooks` query
 * middleware, which keeps a deleted book out of every ordinary read.
 *
 * Takes the caller's mongoose (bookgeek's api is on 7.x, basegeek on 8.x) and
 * neither opens a connection nor registers a model.
 */

function assertMongoose(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/bookgeek/book: pass your own mongoose instance');
  }
}

function createBookFileSchema(mongoose) {
  assertMongoose(mongoose);
  return new mongoose.Schema(
    {
      format: { type: String },
      path: { type: String },
      size: { type: Number },
      addedAt: { type: Date },
    },
    { _id: false }
  );
}

function createBookSeriesSchema(mongoose) {
  assertMongoose(mongoose);
  return new mongoose.Schema(
    {
      name: { type: String },
      index: { type: Number },
    },
    { _id: false }
  );
}

function bookDefinition(mongoose) {
  assertMongoose(mongoose);
  return {
    title: { type: String, required: true },
    authors: [{ type: String }],
    series: createBookSeriesSchema(mongoose),
    isbn: { type: String },
    isbn13: { type: String },

    goodreadsId: { type: String },
    openLibraryId: { type: String },
    asin: { type: String },
    googleBooksId: { type: String },

    publisher: { type: String },
    publishedDate: { type: Date },
    pageCount: { type: Number },
    description: { type: String },
    language: { type: String },
    // The tags as imported (Calibre, enrich). Never rewritten by BookGeek's
    // own edits — see ./tags.js and apps/bookgeek/DOCS/TAGS.md.
    tags: [{ type: String }],
    // Derived from `tags` on every write (deriveTagFields in ./tags.js) and
    // by the api's boot migration: the canonical vocabulary tags, and the raw
    // tags that are neither mapped nor dropped.
    libraryTags: [{ type: String }],
    unsortedTags: [{ type: String }],
    // Tags a person added in BookGeek (TAGS.md §4). Never touched by an
    // import, never mapped; shown as-is under "My tags".
    myTags: [{ type: String }],

    files: [createBookFileSchema(mongoose)],
    coverPath: { type: String },

    owned: { type: Boolean, default: false },
    shelf: { type: String },

    rating: { type: Number, min: 0, max: 5 },
    review: { type: String },
    dateAdded: { type: Date },
    dateStarted: { type: Date },
    dateFinished: { type: Date },
    readCount: { type: Number, default: 0 },
    readingProgress: { type: Number, min: 0, max: 100 },

    source: { type: String },

    // Recently deleted (SUITE_REVIEW_2026-11 S-D5, 2026-11-15). A delete sets
    // these instead of removing the row; the book is restored by clearing
    // them, or purged (row, every reader's BookReading, and its files when
    // `deleteFilesOnPurge`) 30 days after `deletedAt`. Every ordinary read
    // skips a deleted book — see `hideDeletedBooks` below.
    deletedAt: { type: Date },
    deletedBy: { type: String },
    deleteFilesOnPurge: { type: Boolean },
  };
}

const bookSchemaOptions = Object.freeze({ timestamps: true });

/** Does a filter say anything about `deletedAt` (at the top, or in an $and/$or)? */
function mentionsDeletedAt(filter) {
  if (!filter || typeof filter !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(filter, 'deletedAt')) return true;
  return ['$and', '$or', '$nor'].some((op) => Array.isArray(filter[op]) && filter[op].some(mentionsDeletedAt));
}

/**
 * `filter`, plus "deleted or not". The way to reach a book in Recently
 * deleted through a read that would otherwise skip it (its cover, a restore).
 */
function includingDeleted(filter = {}) {
  return { $and: [filter, { $or: [{ deletedAt: null }, { deletedAt: { $ne: null } }] }] };
}

const QUERY_OPS = Object.freeze([
  'find', 'findOne', 'countDocuments', 'distinct',
  'findOneAndUpdate', 'updateOne', 'updateMany',
]);

/**
 * A book in Recently deleted is gone for every ordinary read and write, on
 * BOTH writers (gateway and api) and in every module that loads `Book` —
 * lists, search, facets, shelf counts, the detail sheet, downloads, Kindle,
 * device baskets, the startgeek glance — without each of them remembering a
 * filter. A query that names `deletedAt` itself (the trash list, restore,
 * purge, `includingDeleted`) is left alone. Aggregates get a leading $match
 * unless their first stage names `deletedAt`. Deletes are never narrowed.
 */
function hideDeletedBooks(schema) {
  schema.pre(QUERY_OPS, function hideDeleted() {
    if (mentionsDeletedAt(this.getFilter())) return;
    this.where({ deletedAt: null });
  });
  schema.pre('aggregate', function hideDeletedInAggregate() {
    const pipeline = this.pipeline();
    const first = pipeline[0];
    if (first && first.$match && mentionsDeletedAt(first.$match)) return;
    pipeline.unshift({ $match: { deletedAt: null } });
  });
  return schema;
}

function createBookSchema(mongoose) {
  return hideDeletedBooks(new mongoose.Schema(bookDefinition(mongoose), { ...bookSchemaOptions }));
}

// The tag vocabulary rides along on this module so the gateway can reach it
// through the package's existing `./bookgeek/book` export (the same trick as
// gamegeek/constants re-exporting gamegeek/tags).
const tagVocabulary = require('./tags');

module.exports = {
  tagVocabulary,
  bookDefinition,
  bookSchemaOptions,
  createBookFileSchema,
  createBookSeriesSchema,
  createBookSchema,
  hideDeletedBooks,
  includingDeleted,
  mentionsDeletedAt,
};
