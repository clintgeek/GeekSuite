/**
 * NoteGeek: a search hit in a handwritten note shows where (apps/notegeek/DOCS/HANDWRITING.md §5).
 * `sketchTranscript(noteId)` gains `lastReading` and `lastEdit`: the stored
 * text whatever the content hash, so the page can place a hit that search
 * found in an older reading. Read only; null for locked or encrypted notes;
 * another user's note is not found, exactly as before.
 */
import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { userGeekConn } = await import('../models/user.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { sketchContentHash } = await import('../graphql/notegeek/sketchText.js');

const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const ask = (noteId, user = USER) => resolvers.Query.sketchTranscript(null, { noteId }, { user: { id: user } });

function snapshot(ids) {
  const store = { 'document:document': { id: 'document:document', typeName: 'document', meta: {} } };
  for (const id of ids) store[`shape:${ id }`] = { id: `shape:${ id }`, typeName: 'shape', type: 'draw', x: 0, y: 0, props: {} };
  return JSON.stringify({ store });
}
async function sketch({ ids = ['a', 'b'], transcript = {}, ...over } = {}) {
  const content = snapshot(ids);
  const n = await Note.create({ title: 'Page', content, type: 'handwritten', userId: USER, sketchTranscript: transcript, ...over });
  return { id: String(n._id), hash: sketchContentHash(content) };
}

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
});

describe('lastReading / lastEdit', () => {
  test('a current reading: text, lastReading and no lastEdit', async () => {
    const { id, hash } = await sketch();
    await Note.updateOne({ _id: id }, { $set: { sketchTranscript: { text: 'garage door', hash, status: 'searchable' } } }, { timestamps: false });
    const view = await ask(id);
    expect(view).toMatchObject({ current: true, text: 'garage door', lastReading: 'garage door', lastEdit: null });
  });

  test('a stale reading: text is null, lastReading still has it', async () => {
    const { id } = await sketch({ transcript: { text: 'older page words', hash: 'not-this-content', status: 'stale' } });
    const view = await ask(id);
    expect(view.current).toBe(false);
    expect(view.text).toBeNull();
    expect(view.lastReading).toBe('older page words');
  });

  test('corrections for an older page come back while search still counts them', async () => {
    const { id } = await sketch({
      transcript: { text: 'machine words', hash: 'h-new', edited: { text: 'my corrected words', hash: 'h-old' }, editedSearchable: true },
    });
    expect(await ask(id)).toMatchObject({ text: null, lastReading: 'machine words', lastEdit: 'my corrected words' });
  });

  test('corrections search no longer counts are not returned', async () => {
    const { id } = await sketch({
      transcript: { text: 'machine words', hash: 'h-new', edited: { text: 'rewritten away', hash: 'h-old' }, editedSearchable: false },
    });
    expect((await ask(id)).lastEdit).toBeNull();
  });

  test('locked and encrypted notes give nothing', async () => {
    const t = { text: 'secret plans', hash: 'whatever', edited: { text: 'secret edit', hash: 'whatever' } };
    const locked = await sketch({ transcript: t, isLocked: true });
    const encrypted = await sketch({ transcript: t, isEncrypted: true });
    for (const { id } of [locked, encrypted]) {
      // eslint-disable-next-line no-await-in-loop
      const view = await ask(id);
      expect(view.lastReading).toBeNull();
      expect(view.lastEdit).toBeNull();
    }
  });

  test("another user's note is not found", async () => {
    const { id } = await sketch({ transcript: { text: 'mine', hash: 'x' } });
    await expect(ask(id, OTHER)).rejects.toThrow(/not found/i);
  });

  test('asking stores nothing', async () => {
    const { id } = await sketch({ transcript: { text: 'older', hash: 'x', status: 'stale' } });
    const before = await Note.findById(id).lean();
    await ask(id);
    const after = await Note.findById(id).lean();
    expect(after.sketchTranscript).toEqual(before.sketchTranscript);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.content).toBe(before.content);
  });

  test('no reading yet: both null', async () => {
    const { id } = await sketch();
    expect(await ask(id)).toMatchObject({ lastReading: null, lastEdit: null });
  });
});
