/**
 * Test fixtures for per-reader shelves (apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md).
 *
 * A fixture written as `{ title, shelf: 'read', rating: 5 }` means "this book,
 * and THIS reader's shelf and rating". `createBookFor` splits it: the catalog
 * half goes to `Book`, the reader half to that reader's `BookReading` — the
 * shape production data has after the migration. Seeding reader fields onto
 * the shared Book row would now be invisible to every reader, by design.
 */
import mongoose from 'mongoose';

const { Book } = await import('../../graphql/bookgeek/models/book.js');
const { BookReading } = await import('../../graphql/bookgeek/models/bookReading.js');
const { default: readingModule } = await import('@geeksuite/schemas/bookgeek/bookReading');

const { splitReaderFields } = readingModule;

async function createOne(userId, doc) {
  const { catalog, reader } = splitReaderFields(doc);
  const book = await Book.create(catalog);
  const values = Object.fromEntries(Object.entries(reader).filter(([, v]) => v !== undefined && v !== null));
  if (Object.keys(values).length) {
    await BookReading.create({ userId: String(userId), bookId: book._id, ...values });
  }
  // Hand back what the old `Book.create` did, reader fields included, so
  // existing assertions on the returned doc keep reading the same.
  const plain = book.toObject();
  return Object.assign(book, { ...plain, ...values });
}

/** `Book.create(doc | docs)` with the reader fields filed under `userId`. */
export async function createBookFor(userId, docs) {
  if (Array.isArray(docs)) return Promise.all(docs.map((d) => createOne(userId, d)));
  return createOne(userId, docs);
}

export async function clearReadings() {
  await BookReading.deleteMany({});
}

export { BookReading, mongoose };
