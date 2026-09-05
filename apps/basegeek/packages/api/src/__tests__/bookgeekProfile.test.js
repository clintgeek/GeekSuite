/**
 * bookgeekProfile.test.js
 *
 * The bookgeek Profile resolvers, added 2026-09-05 when the web app's
 * `/api/profile/*` and `/api/ai/status` REST calls moved to the gateway
 * (SUITE_TODO "Ordered cheap-to-expensive" item 3).
 *
 * Unlike Book — a deliberately SHARED household library — the Profile IS
 * per-user, so the expectations here are ordinary row ownership: Alice never
 * sees, edits, or deletes anything of Bob's, and an unauthenticated caller
 * gets nothing at all.
 */

import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { Profile } = await import('../graphql/bookgeek/models/profile.js');
const AIConfig = (await import('../models/AIConfig.js')).default;
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : { user: null });

const Q = resolvers.Query;
const M = resolvers.Mutation;

beforeAll(async () => {
  await Book.db.asPromise();
  await AIConfig.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([Profile.deleteMany({}), Book.deleteMany({}), AIConfig.deleteMany({})]);
});

afterAll(async () => {
  await Book.db.close();
  await AIConfig.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('bookgeek profile — authentication required', () => {
  test('every profile query and mutation rejects an unauthenticated caller', async () => {
    for (const call of [
      () => Q.bookProfile(null, {}, ctx(null)),
      () => Q.libraryFilters(null, {}, ctx(null)),
      () => Q.bookAiStatus(null, {}, ctx(null)),
      () => M.saveBookProfile(null, { input: { kindleEmail: 'x@y.com' } }, ctx(null)),
      () => M.saveLibraryFilter(null, { input: { name: 'x' } }, ctx(null)),
      () => M.deleteLibraryFilter(null, { id: 'f1' }, ctx(null)),
      () => M.addBookShelf(null, { label: 'x' }, ctx(null)),
      () => M.removeBookShelf(null, { id: 'custom-x' }, ctx(null)),
      // a context with no user object at all
      () => Q.bookProfile(null, {}, {}),
      () => M.addBookShelf(null, { label: 'x' }, {}),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
    expect(await Profile.countDocuments({})).toBe(0);
  });
});

describe('bookgeek profile — kindle email and device word', () => {
  test('bookProfile is null before anything is saved, then round-trips', async () => {
    expect(await Q.bookProfile(null, {}, ctx(ALICE))).toBeNull();

    const saved = await M.saveBookProfile(
      null,
      { input: { kindleEmail: '  chef@kindle.com  ', deviceWord: ' Mustang ' } },
      ctx(ALICE)
    );
    expect(saved.kindleEmail).toBe('chef@kindle.com');
    expect(saved.deviceWord).toBe('mustang');
    expect(saved.userId).toBe(ALICE);

    const read = await Q.bookProfile(null, {}, ctx(ALICE));
    expect(read.kindleEmail).toBe('chef@kindle.com');
  });

  test('one user never sees or overwrites another user profile', async () => {
    await M.saveBookProfile(null, { input: { kindleEmail: 'alice@kindle.com' } }, ctx(ALICE));
    await M.saveBookProfile(null, { input: { kindleEmail: 'bob@kindle.com' } }, ctx(BOB));

    expect((await Q.bookProfile(null, {}, ctx(ALICE))).kindleEmail).toBe('alice@kindle.com');
    expect((await Q.bookProfile(null, {}, ctx(BOB))).kindleEmail).toBe('bob@kindle.com');
    expect(await Profile.countDocuments({})).toBe(2);
  });

  test('an empty device word clears it; a malformed one is rejected', async () => {
    await M.saveBookProfile(null, { input: { deviceWord: 'mustang' } }, ctx(ALICE));

    const cleared = await M.saveBookProfile(null, { input: { deviceWord: '   ' } }, ctx(ALICE));
    expect(cleared.deviceWord).toBeUndefined();

    await expect(
      M.saveBookProfile(null, { input: { deviceWord: '9lives' } }, ctx(ALICE))
    ).rejects.toThrow(/must be 3-24 characters/);
    await expect(
      M.saveBookProfile(null, { input: { deviceWord: 'ab' } }, ctx(ALICE))
    ).rejects.toThrow(/must be 3-24 characters/);
  });

  test('a device word already taken by someone else is a conflict', async () => {
    await M.saveBookProfile(null, { input: { deviceWord: 'mustang' } }, ctx(ALICE));
    await expect(
      M.saveBookProfile(null, { input: { deviceWord: 'MUSTANG' } }, ctx(BOB))
    ).rejects.toThrow('That word is already taken');

    // ...but re-saving your own word is fine.
    const again = await M.saveBookProfile(null, { input: { deviceWord: 'mustang' } }, ctx(ALICE));
    expect(again.deviceWord).toBe('mustang');
  });

  test('the model keeps every field the standalone bookgeek API writes', () => {
    // Tripwire for the UserSettings drift hazard: Mongoose strict mode drops
    // unknown fields silently, so a field the bookgeek API model has and this
    // one does not would vanish on any gateway write.
    for (const path of ['userId', 'kindleEmail', 'deviceWord', 'customShelves', 'savedFilters']) {
      expect(Profile.schema.path(path)).toBeDefined();
    }
  });
});

describe('bookgeek profile — saved library filters', () => {
  test('libraryFilters starts empty and survives a save/delete round trip', async () => {
    expect(await Q.libraryFilters(null, {}, ctx(ALICE))).toEqual([]);

    const after = await M.saveLibraryFilter(
      null,
      { input: { name: '  Unread sci-fi  ', shelfFilter: 'unread', tagFilter: 'science fiction' } },
      ctx(ALICE)
    );
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      name: 'Unread sci-fi',
      shelfFilter: 'unread',
      tagFilter: 'science fiction',
      sortDir: 'asc',
      ownedFilter: 'all',
      ownedOnly: false,
    });
    expect(after[0].id).toEqual(expect.any(String));

    const removed = await M.deleteLibraryFilter(null, { id: after[0].id }, ctx(ALICE));
    expect(removed).toEqual([]);
  });

  test('ownedFilter drives ownedOnly, and a legacy boolean still works', async () => {
    const owned = await M.saveLibraryFilter(null, { input: { name: 'Owned', ownedFilter: 'owned' } }, ctx(ALICE));
    expect(owned[0]).toMatchObject({ ownedFilter: 'owned', ownedOnly: true });

    const unowned = await M.saveLibraryFilter(null, { input: { name: 'Unowned', ownedFilter: 'unowned' } }, ctx(ALICE));
    expect(unowned[1]).toMatchObject({ ownedFilter: 'unowned', ownedOnly: false });

    const legacy = await M.saveLibraryFilter(null, { input: { name: 'Legacy', ownedOnly: true } }, ctx(ALICE));
    expect(legacy[2]).toMatchObject({ ownedFilter: 'all', ownedOnly: true });

    const junk = await M.saveLibraryFilter(null, { input: { name: 'Junk', ownedFilter: 'nonsense' } }, ctx(ALICE));
    expect(junk[3].ownedFilter).toBe('all');
  });

  test('a blank name is rejected', async () => {
    await expect(M.saveLibraryFilter(null, { input: { name: '   ' } }, ctx(ALICE))).rejects.toThrow(
      'Filter name is required'
    );
  });

  test('filters are per-user: Bob cannot read or delete Alice presets', async () => {
    const alice = await M.saveLibraryFilter(null, { input: { name: 'Alice preset' } }, ctx(ALICE));
    expect(await Q.libraryFilters(null, {}, ctx(BOB))).toEqual([]);

    await M.deleteLibraryFilter(null, { id: alice[0].id }, ctx(BOB));
    const stillThere = await Q.libraryFilters(null, {}, ctx(ALICE));
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].name).toBe('Alice preset');
  });

  test('deleting an unknown id is a no-op, not an error', async () => {
    await M.saveLibraryFilter(null, { input: { name: 'Keep me' } }, ctx(ALICE));
    const after = await M.deleteLibraryFilter(null, { id: 'no-such-filter' }, ctx(ALICE));
    expect(after).toHaveLength(1);
  });
});

describe('bookgeek profile — custom shelves', () => {
  test('a shelf gets a namespaced id slugged from its label', async () => {
    const profile = await M.addBookShelf(null, { label: '  Comfort   Reads  ' }, ctx(ALICE));
    expect(profile.customShelves).toHaveLength(1);
    expect(profile.customShelves[0]).toMatchObject({
      id: 'custom-comfort-reads',
      label: 'Comfort Reads',
    });
  });

  test('duplicate labels, blank labels, long labels and punctuation-only labels are rejected', async () => {
    await M.addBookShelf(null, { label: 'Comfort reads' }, ctx(ALICE));

    await expect(M.addBookShelf(null, { label: 'comfort   READS' }, ctx(ALICE))).rejects.toThrow(
      'You already have a shelf with that name'
    );
    await expect(M.addBookShelf(null, { label: '   ' }, ctx(ALICE))).rejects.toThrow(
      'Shelf name is required'
    );
    await expect(M.addBookShelf(null, { label: 'x'.repeat(41) }, ctx(ALICE))).rejects.toThrow(
      'Shelf name must be 40 characters or fewer'
    );
    await expect(M.addBookShelf(null, { label: '!!!' }, ctx(ALICE))).rejects.toThrow(
      'Shelf name needs at least one letter or number'
    );
  });

  test('the 20-shelf cap holds', async () => {
    for (let i = 0; i < 20; i += 1) {
      await M.addBookShelf(null, { label: `Shelf ${i}` }, ctx(ALICE));
    }
    await expect(M.addBookShelf(null, { label: 'One too many' }, ctx(ALICE))).rejects.toThrow(
      'You can have up to 20 custom shelves'
    );
    // Bob still gets his own twenty.
    const bob = await M.addBookShelf(null, { label: 'Bob shelf' }, ctx(BOB));
    expect(bob.customShelves).toHaveLength(1);
  });

  test('removing a shelf clears it from every book sitting on it', async () => {
    await M.addBookShelf(null, { label: 'Comfort reads' }, ctx(ALICE));
    await Book.create({ title: 'A', shelf: 'custom-comfort-reads' });
    await Book.create({ title: 'B', shelf: 'custom-comfort-reads' });
    await Book.create({ title: 'C', shelf: 'unread' });

    const res = await M.removeBookShelf(null, { id: 'custom-comfort-reads' }, ctx(ALICE));
    expect(res.clearedBooks).toBe(2);
    expect(res.profile.customShelves).toEqual([]);
    expect(await Book.countDocuments({ shelf: 'custom-comfort-reads' })).toBe(0);
    expect(await Book.countDocuments({ shelf: 'unread' })).toBe(1);
  });

  test('a built-in shelf can never be removed', async () => {
    for (const id of ['unread', 'read', 'on-reader', '']) {
      await expect(M.removeBookShelf(null, { id }, ctx(ALICE))).rejects.toThrow(
        'Only custom shelves can be removed'
      );
    }
    await Book.create({ title: 'A', shelf: 'unread' });
    expect(await Book.countDocuments({ shelf: 'unread' })).toBe(1);
  });

  test('shelves are per-user definitions', async () => {
    await M.addBookShelf(null, { label: 'Alice shelf' }, ctx(ALICE));
    expect((await Q.bookProfile(null, {}, ctx(BOB)))).toBeNull();
  });
});

describe('bookgeek — AI status', () => {
  test('reports disabled when basegeek has no provider configured', async () => {
    const status = await Q.bookAiStatus(null, {}, ctx(ALICE));
    expect(status).toMatchObject({
      enabled: false,
      apiKeyConfigured: false,
      providers: 0,
      model: 'basegeek-rotation',
    });
    expect(typeof status.baseGeekUrl).toBe('string');
  });

  test('reports enabled once a provider is configured, and never returns the key', async () => {
    await AIConfig.create({ provider: 'groq', apiKey: 'gsk_not_a_real_key', enabled: true });
    await AIConfig.create({ provider: 'gemini', apiKey: 'also_not_real', enabled: false });

    const status = await Q.bookAiStatus(null, {}, ctx(BOB));
    expect(status.enabled).toBe(true);
    expect(status.apiKeyConfigured).toBe(true);
    expect(status.providers).toBe(1);
    expect(JSON.stringify(status)).not.toMatch(/gsk_|also_not_real/);
  });
});
