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
    tags: [{ type: String }],

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
  };
}

const bookSchemaOptions = Object.freeze({ timestamps: true });

function createBookSchema(mongoose) {
  return new mongoose.Schema(bookDefinition(mongoose), { ...bookSchemaOptions });
}

module.exports = {
  bookDefinition,
  bookSchemaOptions,
  createBookFileSchema,
  createBookSeriesSchema,
  createBookSchema,
};
