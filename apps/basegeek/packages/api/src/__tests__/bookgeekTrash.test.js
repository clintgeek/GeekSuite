/**
 * bookgeekTrash.test.js — Recently deleted (SUITE_REVIEW_2026-11 S-D5) and
 * the orphan-reading shelf counts (BookGeek finding #4).
 *
 *   - deleteBook marks the book instead of removing it, remembers
 *     deleteFiles for the purge, and keeps every reader's BookReading;
 *   - a deleted book is out of every list, count, facet and detail read;
 *   - deletedBooks lists it (household-shared) with its purge date;
 *   - restoreBook brings it back with everyone's shelf and rating;
 *   - the custom-shelf counts ignore readings whose book is gone or deleted.
 */
import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { BookReading } = await import('../graphql/bookgeek/models/bookReading.js');
const { resolvers, BOOK_TRASH_RETENTION_MS } = await import('../graphql/bookgeek/resolvers.js');

const { Query: Q, Mutation: M } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: id ? { id } : null });

beforeAll(async () => {
  await Book.db.asPromise();
  await BookReading.init();
}, 60000);

afterEach(async () => {
  await Promise.all([Book.deleteMany({}), BookReading.deleteMany({})]);
});

afterAll(async () => {
  await Book.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function twoReaderBook(title = 'Dune') {
  const book = await M.createBook(null, { input: { title, shelf: 'custom-beach' } }, ctx(ALICE));
  const id = String(book._id);
  await M.updateBook(null, { id, input: { rating: 4, shelf: 'reading' } }, ctx(BOB));
  return id;
}

describe('deleteBook moves a book to Recently deleted', () => {
  test('it leaves every list, count, facet and detail read, and the readings stay', async () => {
    const id = await twoReaderBook();
    await M.createBook(null, { input: { title: 'Kept' } }, ctx(ALICE));

    const res = await M.deleteBook(null, { id, deleteFiles: true }, ctx(BOB));
    expect(res).toEqual({ success: true, deletedId: id });

    expect((await Q.books(null, {}, ctx(ALICE))).items.map((b) => b.title)).toEqual(['Kept']);
    expect(await Q.book(null, { id }, ctx(ALICE))).toBeNull();
    expect((await Q.bookFacets(null, {}, ctx(ALICE))).total).toBe(1);
    const stats = await Q.shelves(null, {}, ctx(ALICE));
    expect(stats.total).toBe(1);
    expect(stats.shelves.find((s) => s.id === 'custom-beach')).toBeUndefined();
    expect((await Q.shelves(null, {}, ctx(BOB))).shelves.find((s) => s.id === 'reading').count).toBe(0);

    expect(await BookReading.countDocuments({ bookId: new mongoose.Types.ObjectId(id) })).toBe(2);
    const raw = await Book.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(raw.deletedAt).toBeInstanceOf(Date);
    expect(raw.deletedBy).toBe(BOB);
    expect(raw.deleteFilesOnPurge).toBe(true);
  });

  test('a second delete is a no-op that still answers success; a missing book does not', async () => {
    const id = await twoReaderBook();
    await M.deleteBook(null, { id }, ctx(ALICE));
    const first = (await Book.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).deletedAt;
    expect(await M.deleteBook(null, { id }, ctx(ALICE))).toEqual({ success: true, deletedId: id });
    expect((await Book.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).deletedAt).toEqual(first);
    const missing = String(new mongoose.Types.ObjectId());
    expect(await M.deleteBook(null, { id: missing }, ctx(ALICE))).toEqual({ success: false, deletedId: missing });
  });

  test('an edit cannot reach a book in the trash', async () => {
    const id = await twoReaderBook();
    await M.deleteBook(null, { id }, ctx(ALICE));
    expect(await M.updateBook(null, { id, input: { title: 'Zombie' } }, ctx(ALICE))).toBeNull();
    expect((await Book.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).title).toBe('Dune');
  });
});

describe('deletedBooks and restoreBook', () => {
  test('deletedBooks lists the trash newest first, with the purge date, for any household member', async () => {
    const a = await twoReaderBook('First');
    const b = await twoReaderBook('Second');
    await M.deleteBook(null, { id: a }, ctx(ALICE));
    await new Promise((r) => setTimeout(r, 5));
    await M.deleteBook(null, { id: b }, ctx(ALICE));

    const list = await Q.deletedBooks(null, {}, ctx(BOB));
    expect(list.map((x) => x.title)).toEqual(['Second', 'First']);
    const purgeAt = resolvers.Book.purgeAt(list[0]);
    expect(purgeAt.getTime() - new Date(list[0].deletedAt).getTime()).toBe(BOOK_TRASH_RETENTION_MS);
    expect(resolvers.Book.deletedAt(list[0])).toBeInstanceOf(Date);
    expect(resolvers.Book.deleteFilesOnPurge(list[0])).toBe(false);
    // A live book reads null for all three.
    expect(resolvers.Book.purgeAt({ title: 'x' })).toBeNull();
    expect(resolvers.Book.deleteFilesOnPurge({ title: 'x' })).toBeNull();

    expect((await Q.deletedBooks(null, { limit: 1 }, ctx(BOB))).map((x) => x.title)).toEqual(['Second']);
  });

  test('restoreBook brings it back with every reader’s shelf and rating', async () => {
    const id = await twoReaderBook();
    await M.deleteBook(null, { id, deleteFiles: true }, ctx(ALICE));
    const restored = await M.restoreBook(null, { id }, ctx(BOB));
    expect(restored).toMatchObject({ title: 'Dune', shelf: 'reading', rating: 4 });
    expect(await Q.book(null, { id }, ctx(ALICE))).toMatchObject({ shelf: 'custom-beach' });
    expect(await Q.deletedBooks(null, {}, ctx(ALICE))).toEqual([]);
    const raw = await Book.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(raw).not.toHaveProperty('deletedAt');
    expect(raw).not.toHaveProperty('deleteFilesOnPurge');
  });

  test('restoreBook on a live book returns it; on a missing or malformed id, null', async () => {
    const id = await twoReaderBook();
    expect(await M.restoreBook(null, { id }, ctx(ALICE))).toMatchObject({ title: 'Dune' });
    expect(await M.restoreBook(null, { id: String(new mongoose.Types.ObjectId()) }, ctx(ALICE))).toBeNull();
    await expect(M.restoreBook(null, { id: '' }, ctx(ALICE))).rejects.toThrow();
  });

  test('both need a signed-in member', async () => {
    await expect(Q.deletedBooks(null, {}, ctx(null))).rejects.toThrow(/Unauthorized/);
    await expect(M.restoreBook(null, { id: String(new mongoose.Types.ObjectId()) }, ctx(null))).rejects.toThrow(/Unauthorized/);
  });
});

describe('shelf counts and orphan readings (finding #4)', () => {
  test('a custom shelf does not count a reading whose book no longer exists', async () => {
    const id = await twoReaderBook();
    await M.createBook(null, { input: { title: 'Also beach', shelf: 'custom-beach' } }, ctx(ALICE));
    // An orphan, as the old REST delete left them: the book row is gone.
    await Book.collection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    const stats = await Q.shelves(null, {}, ctx(ALICE));
    expect(stats.shelves.find((s) => s.id === 'custom-beach').count).toBe(1);
  });
});

describe('the one-off orphan sweep (apps/bookgeek/api/scripts/sweep-orphan-readings.mjs)', () => {
  test('finds readings whose book row is gone — not those of a book in the trash — and deletes only with apply', async () => {
    const { sweepOrphanReadings } = await import('../../../../../bookgeek/api/src/migrations/orphanReadings.js');
    const gone = await twoReaderBook('Gone');
    const trashed = await twoReaderBook('Trashed');
    await twoReaderBook('Live');
    await Book.collection.deleteOne({ _id: new mongoose.Types.ObjectId(gone) });
    await M.deleteBook(null, { id: trashed }, ctx(ALICE));

    const dry = await sweepOrphanReadings(BookReading, { booksCollection: Book.collection.name });
    expect(dry).toEqual({ orphans: 2, books: 1, readers: 2, deleted: 0, dryRun: true });
    expect(await BookReading.countDocuments({})).toBe(6);

    const applied = await sweepOrphanReadings(BookReading, { apply: true, booksCollection: Book.collection.name });
    expect(applied.deleted).toBe(2);
    expect(await BookReading.countDocuments({})).toBe(4);
    expect(await BookReading.countDocuments({ bookId: new mongoose.Types.ObjectId(trashed) })).toBe(2);
  });
});
