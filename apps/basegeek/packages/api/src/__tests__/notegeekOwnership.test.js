/**
 * notegeekOwnership.test.js
 *
 * NoteGeek is strictly personal data: every Note carries `userId`. GraphQL
 * sits behind `optionalUser()`, so anonymous callers reach these resolvers —
 * reads must degrade to empty/Unauthorized rather than to an unscoped query,
 * and no id may be used to reach another user's note.
 */

import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const { Query, Mutation } = resolvers;

const makeNote = (overrides = {}) =>
  Note.create({ title: 'Alice note', content: 'secret sauce', userId: ALICE, tags: ['private'], ...overrides });

beforeAll(async () => {
  await Note.db.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await Note.init(); // build the text index used by searchNotes
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('note reads are owner-scoped', () => {
  test('note(id) hides another user’s note behind a not-found error', async () => {
    const note = await makeNote();
    expect(await Query.note(null, { id: String(note._id) }, ctx(ALICE))).not.toBeNull();
    await expect(Query.note(null, { id: String(note._id) }, ctx(BOB))).rejects.toThrow(
      'Note not found'
    );
    await expect(Query.note(null, { id: String(note._id) }, ctx(null))).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('list reads never fall back to an unscoped query', async () => {
    await makeNote();
    expect(await Query.notes(null, {}, ctx(ALICE))).toHaveLength(1);
    expect(await Query.notes(null, {}, ctx(BOB))).toHaveLength(0);
    expect(await Query.notes(null, {}, ctx(null))).toEqual([]);

    expect(await Query.noteTags(null, {}, ctx(ALICE))).toEqual(['private']);
    expect(await Query.noteTags(null, {}, ctx(BOB))).toEqual([]);
    expect(await Query.noteTags(null, {}, ctx(null))).toEqual([]);
  });

  test('searchNotes only ever matches the caller’s own notes', async () => {
    await makeNote({ content: 'zebra pineapple' });
    expect(await Query.searchNotes(null, { q: 'pineapple' }, ctx(ALICE))).toHaveLength(1);
    expect(await Query.searchNotes(null, { q: 'pineapple' }, ctx(BOB))).toHaveLength(0);
    await expect(Query.searchNotes(null, { q: 'pineapple' }, ctx(null))).rejects.toThrow(
      'Unauthorized'
    );
  });
});

describe('note writes are owner-scoped', () => {
  test('another user cannot update or delete a note', async () => {
    const note = await makeNote();

    await expect(
      Mutation.updateNote(null, { id: String(note._id), content: 'pwned' }, ctx(BOB))
    ).rejects.toThrow('Note not found');
    await expect(
      Mutation.deleteNote(null, { id: String(note._id) }, ctx(BOB))
    ).rejects.toThrow('Note not found');

    const fresh = await Note.findById(note._id);
    expect(fresh).not.toBeNull();
    expect(fresh.content).toBe('secret sauce');
  });

  test('mutations reject anonymous callers before touching the database', async () => {
    const note = await makeNote();

    const calls = [
      () => Mutation.createNote(null, { content: 'x' }, ctx(null)),
      () => Mutation.updateNote(null, { id: String(note._id), content: 'x' }, ctx(null)),
      () => Mutation.deleteNote(null, { id: String(note._id) }, ctx(null)),
      () => Mutation.renameTag(null, { oldTag: 'private', newTag: 'public' }, ctx(null)),
      () => Mutation.deleteTag(null, { tag: 'private' }, ctx(null)),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('Unauthorized');

    expect(await Note.countDocuments({})).toBe(1);
    expect((await Note.findById(note._id)).tags).toEqual(['private']);
  });

  test('tag rewrites stay inside the caller’s own notes', async () => {
    const alice = await makeNote();
    const bob = await makeNote({ userId: BOB, title: 'Bob note' });

    await Mutation.renameTag(null, { oldTag: 'private', newTag: 'renamed' }, ctx(ALICE));
    expect((await Note.findById(alice._id)).tags).toEqual(['renamed']);
    expect((await Note.findById(bob._id)).tags).toEqual(['private']);

    await Mutation.deleteTag(null, { tag: 'private' }, ctx(ALICE));
    expect((await Note.findById(bob._id)).tags).toEqual(['private']);
  });

  test('renaming a tag onto one a note already has dedupes instead of duplicating', async () => {
    const note = await makeNote({ tags: ['a', 'b'] });

    const result = await Mutation.renameTag(null, { oldTag: 'a', newTag: 'b' }, ctx(ALICE));

    expect(result).toBe(true);
    expect((await Note.findById(note._id)).tags).toEqual(['b']);
  });

  test('a plain rename with no collision still works and reports true', async () => {
    const note = await makeNote({ tags: ['a'] });

    const result = await Mutation.renameTag(null, { oldTag: 'a', newTag: 'renamed' }, ctx(ALICE));

    expect(result).toBe(true);
    expect((await Note.findById(note._id)).tags).toEqual(['renamed']);
  });

  /**
   * BURN_REVIEW_2 #2. `renameTagArgsSchema` trims both names; the rename
   * dialog (`TagContextMenu.jsx`) compares the RAW strings, so a prefilled
   * name with a trailing space reached the resolver as a rename of `work` to
   * `work`. `$addToSet` was then a no-op and `$pull` deleted the tag from
   * every note that had it — and the sidebar re-added it, so it rendered as a
   * live tag with zero notes.
   */
  test('renaming a tag to itself-after-trim is a no-op, not a deletion', async () => {
    const note = await makeNote({ tags: ['work', 'keep'] });

    const result = await Mutation.renameTag(null, { oldTag: 'work', newTag: 'work ' }, ctx(ALICE));

    expect(result).toBe(false);
    expect((await Note.findById(note._id)).tags).toEqual(['work', 'keep']);
  });

  test('an identical rename is a no-op too', async () => {
    const note = await makeNote({ tags: ['work'] });

    expect(await Mutation.renameTag(null, { oldTag: 'work', newTag: 'work' }, ctx(ALICE))).toBe(false);
    expect((await Note.findById(note._id)).tags).toEqual(['work']);
  });

  test('a case-only rename is a real rename and still happens', async () => {
    const note = await makeNote({ tags: ['work'] });

    const result = await Mutation.renameTag(null, { oldTag: 'work', newTag: 'Work' }, ctx(ALICE));

    expect(result).toBe(true);
    expect((await Note.findById(note._id)).tags).toEqual(['Work']);
  });

  test('renaming a tag nobody has reports false and touches nothing', async () => {
    await makeNote({ tags: ['unrelated'] });

    const result = await Mutation.renameTag(null, { oldTag: 'ghost', newTag: 'x' }, ctx(ALICE));

    expect(result).toBe(false);
  });

  test('created notes are stamped with the session user', async () => {
    const note = await Mutation.createNote(null, { content: 'mine', userId: String(BOB) }, ctx(ALICE));
    expect(String(note.userId)).toBe(String(ALICE));
  });
});
