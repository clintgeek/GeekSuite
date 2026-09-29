/**
 * notegeekPin.test.js
 *
 * setNotePinned — pin/unpin a note. Same ownership shape as every other
 * note mutation (notegeekOwnership.test.js): scoped to `{ _id, userId }`,
 * "Note not found" for someone else's note, "Unauthorized" with no session.
 */

import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const { Query, Mutation } = resolvers;

const makeNote = (overrides = {}) =>
  Note.create({ title: 'Alice note', content: 'secret sauce', userId: ALICE, ...overrides });

beforeAll(async () => {
  await Note.db.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('setNotePinned', () => {
  test('a new note defaults to unpinned', async () => {
    const note = await makeNote();
    expect(note.pinned).toBe(false);
    expect(note.pinnedAt).toBeNull();
  });

  test('the owner can pin and unpin, and pinnedAt tracks the pin', async () => {
    const note = await makeNote();

    const pinned = await Mutation.setNotePinned(null, { id: String(note._id), pinned: true }, ctx(ALICE));
    expect(pinned.pinned).toBe(true);
    expect(pinned.pinnedAt).not.toBeNull();

    const unpinned = await Mutation.setNotePinned(null, { id: String(note._id), pinned: false }, ctx(ALICE));
    expect(unpinned.pinned).toBe(false);
    expect(unpinned.pinnedAt).toBeNull();
  });

  test('pinning does not touch the note body or create a history entry', async () => {
    const note = await makeNote({ content: 'original body', title: 'original title' });

    const pinned = await Mutation.setNotePinned(null, { id: String(note._id), pinned: true }, ctx(ALICE));

    expect(pinned.content).toBe('original body');
    expect(pinned.title).toBe('original title');
    const versions = await Query.noteVersions(null, { noteId: String(note._id) }, ctx(ALICE));
    expect(versions).toEqual([]);
  });

  test('another user cannot pin my note', async () => {
    const note = await makeNote();

    await expect(
      Mutation.setNotePinned(null, { id: String(note._id), pinned: true }, ctx(BOB))
    ).rejects.toThrow('Note not found');

    const fresh = await Note.findById(note._id);
    expect(fresh.pinned).toBe(false);
  });

  test('an anonymous caller is rejected before touching the database', async () => {
    const note = await makeNote();

    await expect(
      Mutation.setNotePinned(null, { id: String(note._id), pinned: true }, ctx(null))
    ).rejects.toThrow('Unauthorized');

    const fresh = await Note.findById(note._id);
    expect(fresh.pinned).toBe(false);
  });

  test('a pinned note sorts first even against the requested order', async () => {
    // Titles chosen so title_asc's NATURAL order (Apple, Mango, Zebra) would
    // put the pinned note last — proving pinned-first is a real override,
    // not a coincidence of the secondary sort. No timestamps involved.
    const apple = await makeNote({ title: 'Apple' });
    const mango = await makeNote({ title: 'Mango' });
    const zebra = await makeNote({ title: 'Zebra' });
    await Mutation.setNotePinned(null, { id: String(zebra._id), pinned: true }, ctx(ALICE));

    const byTitle = await Query.notes(null, { sort: 'title_asc' }, ctx(ALICE));
    expect(String(byTitle[0]._id)).toBe(String(zebra._id));
    // The unpinned notes still respect the requested secondary order.
    expect(String(byTitle[1]._id)).toBe(String(apple._id));
    expect(String(byTitle[2]._id)).toBe(String(mango._id));
  });
});
