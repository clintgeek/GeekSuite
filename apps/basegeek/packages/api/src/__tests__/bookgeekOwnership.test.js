/**
 * bookgeekOwnership.test.js
 *
 * BookGeek is a deliberately SHARED household library — the Book model has no
 * owner/userId field and the standalone bookgeek API serves files without
 * per-book ownership — so the boundary enforced here is "authenticated
 * household member", not "row owner":
 *   1. Every query and mutation requires a signed-in user (previously only
 *      createBook did, leaving reads and writes fully anonymous).
 *   2. Shared reads still return the whole library to any authenticated user —
 *      no per-user scoping was invented.
 *   3. Malformed ids resolve as not-found instead of throwing a CastError.
 */

import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : { user: null });

const makeBook = (overrides = {}) =>
  Book.create({
    title: 'Dune',
    authors: ['Frank Herbert'],
    shelf: 'unread',
    owned: true,
    ...overrides,
  });

beforeAll(async () => {
  await Book.db.asPromise();
}, 60000);

afterEach(async () => {
  await Book.deleteMany({});
});

afterAll(async () => {
  await Book.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('bookgeek — authentication required', () => {
  test('every query rejects an unauthenticated caller', async () => {
    const b = await makeBook();
    for (const call of [
      () => resolvers.Query.books(null, {}, ctx(null)),
      () => resolvers.Query.book(null, { id: String(b._id) }, ctx(null)),
      () => resolvers.Query.shelves(null, {}, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
  });

  test('every mutation rejects an unauthenticated caller and changes nothing', async () => {
    const b = await makeBook();
    for (const call of [
      () => resolvers.Mutation.createBook(null, { input: { title: 'Injected' } }, ctx(null)),
      () => resolvers.Mutation.updateBook(null, { id: String(b._id), input: { title: 'pwned' } }, ctx(null)),
      () => resolvers.Mutation.deleteBook(null, { id: String(b._id) }, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }

    expect(await Book.countDocuments({})).toBe(1);
    expect((await Book.findById(b._id)).title).toBe('Dune');
  });

  test('a context with no user object at all is still rejected', async () => {
    await expect(resolvers.Query.books(null, {}, {})).rejects.toThrow('Unauthorized');
    await expect(
      resolvers.Mutation.deleteBook(null, { id: String(new mongoose.Types.ObjectId()) }, {})
    ).rejects.toThrow('Unauthorized');
  });
});

describe('bookgeek — the library stays deliberately shared', () => {
  test('any authenticated user sees every book, whoever created it', async () => {
    const created = await resolvers.Mutation.createBook(
      null,
      { input: { title: 'Neuromancer', authors: ['William Gibson'] } },
      ctx(ALICE)
    );
    expect(created.title).toBe('Neuromancer');

    // Bob — a different household member — reads the same shared library.
    const page = await resolvers.Query.books(null, {}, ctx(BOB));
    expect(page.total).toBe(1);
    expect(page.items[0].title).toBe('Neuromancer');
    expect(page).toMatchObject({ page: 1, pageSize: 50 });

    const single = await resolvers.Query.book(null, { id: String(created._id) }, ctx(BOB));
    expect(single).not.toBeNull();
    expect(single.title).toBe('Neuromancer');
  });

  test('shelves counts the whole library for any authenticated user', async () => {
    await makeBook({ title: 'A', shelf: 'unread', owned: true });
    await makeBook({ title: 'B', shelf: 'read', owned: false, readCount: 1 });

    const stats = await resolvers.Query.shelves(null, {}, ctx(BOB));
    expect(stats.total).toBe(2);
    expect(stats.owned).toBe(1);
    expect(stats.unowned).toBe(1);
    expect(stats.shelves.find((s) => s.id === 'unread').count).toBe(1);
    expect(stats.shelves.find((s) => s.id === 'read').count).toBe(1);
  });

  test('shelves counts the on-reader shelf and any custom shelf values', async () => {
    await makeBook({ title: 'A', shelf: 'on-reader' });
    await makeBook({ title: 'B', shelf: 'custom-cookbooks' });
    await makeBook({ title: 'C', shelf: 'custom-cookbooks' });
    await makeBook({ title: 'D', shelf: 'unread' });

    const stats = await resolvers.Query.shelves(null, {}, ctx(ALICE));
    expect(stats.total).toBe(4);
    expect(stats.shelves.find((s) => s.id === 'on-reader').count).toBe(1);
    expect(stats.shelves.find((s) => s.id === 'custom-cookbooks').count).toBe(2);
    // a custom shelf never leaks into the unread bucket
    expect(stats.shelves.find((s) => s.id === 'unread').count).toBe(1);
  });

  test('a shared book can be updated and deleted by any authenticated member', async () => {
    const b = await makeBook();

    const updated = await resolvers.Mutation.updateBook(
      null,
      { id: String(b._id), input: { shelf: 'reading', rating: 5 } },
      ctx(BOB)
    );
    expect(updated.shelf).toBe('reading');

    const del = await resolvers.Mutation.deleteBook(null, { id: String(b._id) }, ctx(ALICE));
    expect(del).toEqual({ success: true, deletedId: String(b._id) });
    expect(await Book.countDocuments({})).toBe(0);
  });

  test('filters and paging still work for an authenticated caller', async () => {
    await makeBook({ title: 'Alpha', authors: ['Ann'], tags: ['scifi'] });
    await makeBook({ title: 'Beta', authors: ['Bea'], tags: ['history'] });

    const byTag = await resolvers.Query.books(null, { tag: 'scifi' }, ctx(ALICE));
    expect(byTag.total).toBe(1);
    expect(byTag.items[0].title).toBe('Alpha');

    const byQuery = await resolvers.Query.books(null, { q: 'bea' }, ctx(ALICE));
    expect(byQuery.total).toBe(1);
    expect(byQuery.items[0].title).toBe('Beta');

    const paged = await resolvers.Query.books(null, { page: 1, limit: 1 }, ctx(ALICE));
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(2);
    expect(paged.pageSize).toBe(1);
  });
});

describe('bookgeek — malformed ids', () => {
  test('book returns null instead of throwing a CastError', async () => {
    expect(await resolvers.Query.book(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
  });

  test('updateBook / deleteBook degrade safely on a bad or missing id', async () => {
    expect(
      await resolvers.Mutation.updateBook(null, { id: 'garbage', input: { title: 'x' } }, ctx(ALICE))
    ).toBeNull();

    expect(await resolvers.Mutation.deleteBook(null, { id: 'garbage' }, ctx(ALICE))).toEqual({
      success: false,
      deletedId: 'garbage',
    });

    const missing = String(new mongoose.Types.ObjectId());
    expect(await resolvers.Mutation.deleteBook(null, { id: missing }, ctx(ALICE))).toEqual({
      success: false,
      deletedId: missing,
    });
  });
});
