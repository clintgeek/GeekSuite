/**
 * bookgeekPerReader.test.js — apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md.
 *
 * "The books can/should be all one big happy library, but my reading shelf
 * is my reading shelf." — Chef, 2026-10-13.
 *
 *   - catalog edits are shared; shelf, rating, review, dates, progress and
 *     myTags are the caller's alone, on every read and write path;
 *   - a reader with no record of a book sees it unread;
 *   - the shared row's legacy reader values never show through;
 *   - the boot migration files today's values under Chef exactly once,
 *     merges per field, and leaves the legacy fields in place.
 */
import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { BookReading } = await import('../graphql/bookgeek/models/bookReading.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');
const { migrateReaderFields, MIGRATION_ID } = await import('../graphql/bookgeek/migrateReaderFields.js');
const { default: shared } = await import('@geeksuite/schemas/bookgeek/bookReading');

const { Query: Q, Mutation: M } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id } });
const markers = () => BookReading.db.collection('migrations');

beforeAll(async () => {
  await Book.db.asPromise();
  await BookReading.init();
}, 60000);

afterEach(async () => {
  await Promise.all([Book.deleteMany({}), BookReading.deleteMany({}), markers().deleteMany({})]);
});

afterAll(async () => {
  await Book.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const titles = (page) => page.items.map((b) => b.title).sort();

describe('two readers, one library', () => {
  test('Bob shelving and rating a book changes nothing for Alice', async () => {
    const book = await M.createBook(null, { input: { title: 'Dune', authors: ['Frank Herbert'] } }, ctx(ALICE));
    const id = String(book._id);

    await M.updateBook(null, {
      id,
      input: { shelf: 'reading', rating: 2, review: 'meh', readingProgress: 40, myTags: ['bob-tag'] },
    }, ctx(BOB));
    await M.updateBook(null, { id, input: { shelf: 'read', rating: 5, myTags: ['alice-tag'] } }, ctx(ALICE));

    const forAlice = await Q.book(null, { id }, ctx(ALICE));
    const forBob = await Q.book(null, { id }, ctx(BOB));
    expect(forAlice).toMatchObject({ shelf: 'read', rating: 5, review: null, readingProgress: null, myTags: ['alice-tag'] });
    expect(forBob).toMatchObject({ shelf: 'reading', rating: 2, review: 'meh', readingProgress: 40, myTags: ['bob-tag'] });
  });

  test('catalog edits are shared', async () => {
    const book = await M.createBook(null, { input: { title: 'Dune' } }, ctx(ALICE));
    await M.updateBook(null, { id: String(book._id), input: { title: 'Dune (1965)' } }, ctx(BOB));
    expect((await Q.book(null, { id: String(book._id) }, ctx(ALICE))).title).toBe('Dune (1965)');
  });

  test('a new book is on the creator’s shelf only; everyone else sees it unread', async () => {
    const book = await M.createBook(null, { input: { title: 'Hyperion', shelf: 'reading' } }, ctx(ALICE));
    expect(book.shelf).toBe('reading');
    expect((await Q.book(null, { id: String(book._id) }, ctx(BOB))).shelf).toBeNull();
    expect(titles(await Q.books(null, { shelf: 'unread' }, ctx(BOB)))).toEqual(['Hyperion']);
    expect(titles(await Q.books(null, { shelf: 'reading' }, ctx(ALICE)))).toEqual(['Hyperion']);
    expect((await Q.books(null, { shelf: 'reading' }, ctx(BOB))).total).toBe(0);
  });

  test('the shared row’s legacy values never show through', async () => {
    // A row written before the migration: reader fields ON the book.
    const legacy = await Book.create({ title: 'Old', shelf: 'read', rating: 4, readCount: 2, myTags: ['x'] });
    const forBob = await Q.book(null, { id: String(legacy._id) }, ctx(BOB));
    expect(forBob).toMatchObject({ shelf: null, rating: null, readCount: 0, myTags: [] });
    expect((await Q.books(null, { filter: { ratingMin: 1 } }, ctx(BOB))).total).toBe(0);
  });

  test('sorting and filtering by rating use the caller’s ratings', async () => {
    const [a, b] = await Promise.all([
      M.createBook(null, { input: { title: 'A' } }, ctx(ALICE)),
      M.createBook(null, { input: { title: 'B' } }, ctx(ALICE)),
    ]);
    await M.updateBook(null, { id: String(a._id), input: { rating: 5 } }, ctx(ALICE));
    await M.updateBook(null, { id: String(b._id), input: { rating: 1 } }, ctx(ALICE));
    await M.updateBook(null, { id: String(a._id), input: { rating: 1 } }, ctx(BOB));
    await M.updateBook(null, { id: String(b._id), input: { rating: 5 } }, ctx(BOB));

    const top = (page) => page.items[0].title;
    expect(top(await Q.books(null, { sort: 'rating', sortDir: 'desc' }, ctx(ALICE)))).toBe('A');
    expect(top(await Q.books(null, { sort: 'rating', sortDir: 'desc' }, ctx(BOB)))).toBe('B');
    expect(titles(await Q.books(null, { filter: { ratingMin: 4 } }, ctx(BOB)))).toEqual(['B']);
  });

  test('facets count the caller’s shelves', async () => {
    const book = await M.createBook(null, { input: { title: 'A', shelf: 'read' } }, ctx(ALICE));
    expect(book.shelf).toBe('read');
    const shelfCounts = (f) => Object.fromEntries(f.shelves.map((s) => [s.value, s.count]));
    expect(shelfCounts(await Q.bookFacets(null, {}, ctx(ALICE)))).toMatchObject({ read: 1 });
    expect(shelfCounts(await Q.bookFacets(null, {}, ctx(BOB)))).toEqual({ unread: 1 });
  });

  test('deleting a book deletes every reader’s record of it', async () => {
    const book = await M.createBook(null, { input: { title: 'Gone', shelf: 'reading' } }, ctx(ALICE));
    await M.updateBook(null, { id: String(book._id), input: { rating: 3 } }, ctx(BOB));
    expect(await BookReading.countDocuments({ bookId: book._id })).toBe(2);
    await M.deleteBook(null, { id: String(book._id) }, ctx(BOB));
    expect(await BookReading.countDocuments({ bookId: book._id })).toBe(0);
  });

  test('clearing my rating clears mine', async () => {
    const book = await M.createBook(null, { input: { title: 'A' } }, ctx(ALICE));
    await M.updateBook(null, { id: String(book._id), input: { rating: 4 } }, ctx(ALICE));
    const cleared = await M.updateBook(null, { id: String(book._id), input: { rating: null } }, ctx(ALICE));
    expect(cleared.rating).toBeNull();
  });
});

describe('migrateReaderFields (boot, once)', () => {
  const CHEF = '6818c2bddcf626909f6a93a1';

  test('files every shared value under Chef, leaves the legacy fields, and runs once', async () => {
    const read = await Book.create({ title: 'Read', shelf: 'read', rating: 5, readCount: 2, dateFinished: new Date('2024-01-02'), myTags: ['fav'] });
    const bare = await Book.create({ title: 'Never touched' });

    const first = await migrateReaderFields({ Book, BookReading });
    expect(first).toMatchObject({ skipped: false, books: 1 });

    const rec = await BookReading.findOne({ userId: CHEF, bookId: read._id }).lean();
    expect(rec).toMatchObject({ shelf: 'read', rating: 5, readCount: 2, myTags: ['fav'] });
    expect(await BookReading.countDocuments({ bookId: bare._id })).toBe(0);
    // Deprecate-first: the shared row is untouched.
    expect((await Book.findById(read._id).lean()).rating).toBe(5);

    // Chef clears his rating; a reboot must not refill it.
    await BookReading.updateOne({ _id: rec._id }, { $unset: { rating: '' } });
    expect(await migrateReaderFields({ Book, BookReading })).toEqual({ skipped: true });
    expect((await BookReading.findById(rec._id).lean()).rating).toBeUndefined();
    expect(await markers().findOne({ _id: MIGRATION_ID })).toBeTruthy();
  });

  test('a value Chef set before it ran wins; the rest still arrive', async () => {
    const book = await Book.create({ title: 'Raced', shelf: 'read', rating: 3, readCount: 1 });
    // A write in the first second after boot: defaults readCount 0.
    await M.updateBook(null, { id: String(book._id), input: { rating: 5 } }, ctx(CHEF));

    await migrateReaderFields({ Book, BookReading });
    const rec = await BookReading.findOne({ userId: CHEF, bookId: book._id }).lean();
    expect(rec).toMatchObject({ rating: 5, shelf: 'read', readCount: 1 });
  });
});

describe('mergeReadings (merge duplicates, Goodreads dedupe)', () => {
  test('each reader’s record fills their own blanks on the kept book — readers never mix', async () => {
    const keep = await Book.create({ title: 'Dune' });
    const dupe = await Book.create({ title: 'Dune (Goodreads)' });
    await BookReading.create([
      { userId: ALICE, bookId: keep._id, rating: 4, myTags: ['desert'] },
      { userId: ALICE, bookId: dupe._id, rating: 2, shelf: 'read', readCount: 1, myTags: ['spice'] },
      { userId: BOB, bookId: dupe._id, shelf: 'reading', readingProgress: 30 },
    ]);

    await shared.mergeReadings(BookReading, dupe._id, keep._id);

    const alice = await BookReading.findOne({ userId: ALICE, bookId: keep._id }).lean();
    const bob = await BookReading.findOne({ userId: BOB, bookId: keep._id }).lean();
    // Alice keeps her 4★, gains the dupe's shelf/count, and both tag sets.
    expect(alice).toMatchObject({ rating: 4, shelf: 'read', readCount: 1 });
    expect(alice.myTags.sort()).toEqual(['desert', 'spice']);
    // Bob's progress moves with him, and only to him.
    expect(bob).toMatchObject({ shelf: 'reading', readingProgress: 30 });
    expect(bob.rating).toBeUndefined();
    expect(await BookReading.countDocuments({ bookId: dupe._id })).toBe(0);
  });
});
