/**
 * notegeekOwnership.test.js
 *
 * NoteGeek is strictly personal data: every Note and Folder carries `userId`.
 * GraphQL sits behind `optionalUser()`, so anonymous callers reach these
 * resolvers — reads must degrade to empty/Unauthorized rather than to an
 * unscoped query, and no id may be used to reach another user's note.
 */

import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: Folder } = await import('../graphql/notegeek/models/Folder.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const { Query, Mutation } = resolvers;

const makeNote = (overrides = {}) =>
  Note.create({ title: 'Alice note', content: 'secret sauce', userId: ALICE, tags: ['private'], ...overrides });

beforeAll(async () => {
  await Note.db.asPromise();
  // Folder is registered on the default mongoose connection.
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await Note.init(); // build the text index used by searchNotes
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
  await Folder.deleteMany({});
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

    await expect(Query.folders(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
  });

  test('searchNotes only ever matches the caller’s own notes', async () => {
    await makeNote({ content: 'zebra pineapple' });
    expect(await Query.searchNotes(null, { q: 'pineapple' }, ctx(ALICE))).toHaveLength(1);
    expect(await Query.searchNotes(null, { q: 'pineapple' }, ctx(BOB))).toHaveLength(0);
    await expect(Query.searchNotes(null, { q: 'pineapple' }, ctx(null))).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('folders are per-user', async () => {
    await Folder.create({ name: 'Alice folder', userId: ALICE });
    expect(await Query.folders(null, {}, ctx(ALICE))).toHaveLength(1);
    expect(await Query.folders(null, {}, ctx(BOB))).toHaveLength(0);
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
    const folder = await Folder.create({ name: 'Alice folder', userId: ALICE });

    const calls = [
      () => Mutation.createNote(null, { content: 'x' }, ctx(null)),
      () => Mutation.updateNote(null, { id: String(note._id), content: 'x' }, ctx(null)),
      () => Mutation.deleteNote(null, { id: String(note._id) }, ctx(null)),
      () => Mutation.renameTag(null, { oldTag: 'private', newTag: 'public' }, ctx(null)),
      () => Mutation.deleteTag(null, { tag: 'private' }, ctx(null)),
      () => Mutation.createFolder(null, { name: 'x' }, ctx(null)),
      () => Mutation.updateFolder(null, { id: String(folder._id), name: 'x' }, ctx(null)),
      () => Mutation.deleteFolder(null, { id: String(folder._id) }, ctx(null)),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('Unauthorized');

    expect(await Note.countDocuments({})).toBe(1);
    expect((await Note.findById(note._id)).tags).toEqual(['private']);
    expect(await Folder.countDocuments({})).toBe(1);
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

  test('folders cannot be updated or deleted across users', async () => {
    const folder = await Folder.create({ name: 'Alice folder', userId: ALICE });
    await expect(
      Mutation.updateFolder(null, { id: String(folder._id), name: 'pwned' }, ctx(BOB))
    ).rejects.toThrow('Folder not found');
    await expect(
      Mutation.deleteFolder(null, { id: String(folder._id) }, ctx(BOB))
    ).rejects.toThrow('Folder not found');
    expect((await Folder.findById(folder._id)).name).toBe('Alice folder');
  });

  test('created notes are stamped with the session user', async () => {
    const note = await Mutation.createNote(null, { content: 'mine', userId: String(BOB) }, ctx(ALICE));
    expect(String(note.userId)).toBe(String(ALICE));
  });
});

describe('updateFolder rejects a parentId that would create a cycle', () => {
  test('a folder cannot become its own parent', async () => {
    const folder = await Folder.create({ name: 'Self', userId: ALICE });

    await expect(
      Mutation.updateFolder(null, { id: String(folder._id), parentId: String(folder._id) }, ctx(ALICE))
    ).rejects.toThrow('cannot be moved into itself');

    expect((await Folder.findById(folder._id)).parentId).toBeNull();
  });

  test('a folder cannot be reparented under its own direct child', async () => {
    const parent = await Folder.create({ name: 'Parent', userId: ALICE });
    const child = await Folder.create({ name: 'Child', userId: ALICE, parentId: parent._id });

    await expect(
      Mutation.updateFolder(null, { id: String(parent._id), parentId: String(child._id) }, ctx(ALICE))
    ).rejects.toThrow('cannot be moved into itself');

    expect((await Folder.findById(parent._id)).parentId).toBeNull();
  });

  test('a folder cannot be reparented under a grandchild', async () => {
    const grandparent = await Folder.create({ name: 'Grandparent', userId: ALICE });
    const parent = await Folder.create({ name: 'Parent', userId: ALICE, parentId: grandparent._id });
    const child = await Folder.create({ name: 'Child', userId: ALICE, parentId: parent._id });

    await expect(
      Mutation.updateFolder(
        null,
        { id: String(grandparent._id), parentId: String(child._id) },
        ctx(ALICE)
      )
    ).rejects.toThrow('cannot be moved into itself');

    expect((await Folder.findById(grandparent._id)).parentId).toBeNull();
  });

  test('a valid move to an unrelated folder (or back to root) still succeeds', async () => {
    const a = await Folder.create({ name: 'A', userId: ALICE });
    const b = await Folder.create({ name: 'B', userId: ALICE });

    const moved = await Mutation.updateFolder(
      null,
      { id: String(b._id), parentId: String(a._id) },
      ctx(ALICE)
    );
    expect(String(moved.parentId)).toBe(String(a._id));

    const rooted = await Mutation.updateFolder(
      null,
      { id: String(b._id), parentId: null },
      ctx(ALICE)
    );
    expect(rooted.parentId).toBeNull();
  });
});
