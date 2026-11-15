/**
 * NoteGeek: sketch transcripts and search stay honest (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md
 * 1.21 N items, 2.8 server, 5.8, 5.9):
 *   - a crashed claim no longer throws away a Convert reading
 *   - outages and capped days never count toward `failed`
 *   - an autosave never writes an older transcript back into word search
 *   - erased ink and corrections of a rewritten page stop being searchable
 *   - the indexer never marks a note indexed against an older transcript
 *   - the content hash is remembered, not recomputed on every read
 *   - photo/locked sketches are answered without checking the image
 *   - the vector cache is patched per note; one slow embed doesn't trip the breaker
 *   - passages fit the embedding model's window
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteChunk } = await import('../graphql/notegeek/models/NoteChunk.js');
const { userGeekConn } = await import('../models/user.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const st = await import('../graphql/notegeek/sketchTranscript.js');
const { sketchContentHash } = await import('../graphql/notegeek/sketchText.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const { runIndexerOnce, QUIET_MS } = await import('../graphql/notegeek/indexer.js');
const { chunkNote, MAX_CHUNK_CHARS } = await import('../graphql/notegeek/chunking.js');
const { EmbeddingsUnavailableError } = await import('../graphql/notegeek/embeddings.js');

const { Mutation } = resolvers;
const USER = new mongoose.Types.ObjectId().toString();
const ctx = { user: { id: USER } };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const T0 = Date.parse('2026-11-15T15:00:00Z');
const MIN = 60 * 1000;

function snapshot(ids) {
  const store = { 'document:document': { id: 'document:document', typeName: 'document', meta: {} } };
  for (const id of ids) store[`shape:${ id }`] = { id: `shape:${ id }`, typeName: 'shape', type: 'draw', x: 0, y: 0, props: {} };
  return JSON.stringify({ store });
}
async function sketch(ids = ['a'], over = {}) {
  const n = await Note.create({ title: 'Page', content: snapshot(ids), type: 'handwritten', userId: USER, ...over });
  return String(n._id);
}
const stored = (id) => Note.findById(id).lean();
const reading = (text) => jest.fn(async () => ({ text, provenance: { provider: 'p', model: 'm' } }));
const failing = (code) => jest.fn(async () => { throw Object.assign(new Error(code), { extensions: { code } }); });
const run = (id, transcribe, now = T0) => st.autoTranscribeSketch({ noteId: id, userId: USER, image: PNG, mediaType: 'image/png', now, transcribe });

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
  semantic._resetSemanticState();
  await Note.deleteMany({});
  await NoteChunk.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
});

describe('claims', () => {
  test('a claim left by a crashed gateway does not throw away a Convert reading', async () => {
    const id = await sketch();
    await Note.updateOne({ _id: id }, { $set: { 'sketchTranscript.status': 'processing', 'sketchTranscript.claimedAt': new Date(T0 - 3 * MIN) } }, { timestamps: false });
    await st.rememberConvertReading({ noteId: id, userId: USER, text: 'from convert', provenance: {}, now: T0 });
    expect((await stored(id)).sketchTranscript).toMatchObject({ text: 'from convert', status: 'searchable' });
  });

  test('a running claim still wins', async () => {
    const id = await sketch();
    await Note.updateOne({ _id: id }, { $set: { 'sketchTranscript.status': 'processing', 'sketchTranscript.claimedAt': new Date(T0 - 10 * 1000) } }, { timestamps: false });
    await st.rememberConvertReading({ noteId: id, userId: USER, text: 'from convert', provenance: {}, now: T0 });
    expect((await stored(id)).sketchTranscript.text ?? null).toBeNull();
  });
});

describe('what counts toward failed', () => {
  async function failNTimes(code, n) {
    const id = await sketch();
    let now = T0;
    let view;
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      view = await run(id, failing(code), now);
      now += 3 * 24 * 60 * MIN; // past any retryAt
    }
    return { id, view };
  }
  test('seven capped days: still waiting, never failed', async () => {
    const { id, view } = await failNTimes('AI_CAP', 7);
    expect(view.status).toBe('retry');
    expect((await stored(id)).sketchTranscript).toMatchObject({ attempts: 0, retries: 7 });
  });
  test('seven outages: still waiting, never failed', async () => {
    const { view } = await failNTimes('AI_UNAVAILABLE', 7);
    expect(view.status).toBe('retry');
  });
  test('six failures about the page itself: failed', async () => {
    const { view } = await failNTimes('SOMETHING_ELSE', 6);
    expect(view.status).toBe('failed');
  });
});

describe('word search never goes back in time', () => {
  test('an autosave does not write an older transcript back', async () => {
    const id = await sketch(['a']);
    await Note.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { 'sketchTranscript.text': 'new reading', wordText: 'new reading' } });
    // The save's own read of the note happened before the new reading landed.
    const realFindOne = Note.findOne.bind(Note);
    jest.spyOn(Note, 'findOne').mockImplementation((filter, proj, ...rest) => {
      if (proj && proj.sketchTranscript === 1 && proj.isEncrypted === 1) {
        return { lean: async () => ({ type: 'handwritten', sketchTranscript: { text: 'old reading' } }) };
      }
      return realFindOne(filter, proj, ...rest);
    });
    await Mutation.updateNote(null, { id, content: snapshot(['a', 'b']), type: 'handwritten' }, ctx);
    jest.restoreAllMocks();
    expect((await stored(id)).wordText).toBe('new reading');
  });

  test('erasing everything clears what was read from the ink', async () => {
    const id = await sketch(['a']);
    await run(id, reading('erased words'));
    expect((await stored(id)).wordText).toBe('erased words');
    await Mutation.updateNote(null, { id, content: snapshot([]), type: 'handwritten' }, ctx);
    const after = await stored(id);
    expect(after.wordText).toBe('');
    expect(after.preview).toBe('');
    expect(after.sketchTranscript.text).toBeNull();
  });

  test('a reading that lands after everything was erased is not stored', async () => {
    const id = await sketch(['a']);
    const slow = jest.fn(async () => {
      await Note.updateOne({ _id: id }, { content: snapshot([]) });
      return { text: 'ghost words', provenance: {} };
    });
    await run(id, slow);
    expect((await stored(id)).wordText).toBe('');
  });

  test('corrections of a page that was rewritten stop being searchable; of a page added to, stay', async () => {
    const id = await sketch(['a']);
    await run(id, reading('by milk'));
    const { contentHash } = await st.getSketchTranscript({ noteId: id, userId: USER, now: T0 });
    await st.saveSketchTranscriptEdit({ noteId: id, userId: USER, text: 'buy milk', forHash: contentHash, now: T0 });
    // Rewritten: the old lines are gone.
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot(['z']), type: 'handwritten' });
    await run(id, reading('dentist at four'), T0 + 5 * MIN);
    expect((await stored(id)).wordText).toBe('dentist at four');

    const id2 = await sketch(['a']);
    await run(id2, reading('by milk'));
    const h2 = (await st.getSketchTranscript({ noteId: id2, userId: USER, now: T0 })).contentHash;
    await st.saveSketchTranscriptEdit({ noteId: id2, userId: USER, text: 'buy milk', forHash: h2, now: T0 });
    await Note.findOneAndUpdate({ _id: id2 }, { content: snapshot(['a', 'b']), type: 'handwritten' });
    await run(id2, reading('by milk\neggs'), T0 + 5 * MIN);
    expect((await stored(id2)).wordText).toBe('by milk\neggs\n\nbuy milk');
  });
});

describe('the indexer and a transcript landing mid-embed', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  test('the note stays stale and is embedded again with the new text', async () => {
    const id = await sketch(['a'], { sketchTranscript: { text: 'first reading', hash: 'h' } });
    await Note.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { updatedAt: new Date(Date.now() - QUIET_MS - 5000) } });
    let calls = 0;
    globalThis.fetch = jest.fn(async (url, init) => {
      calls += 1;
      if (calls === 1) await st.saveSketchTranscriptEdit({ noteId: id, userId: USER, text: 'second reading' });
      const { input } = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ embeddings: input.map(() => Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0))) }) };
    });
    const first = await runIndexerOnce({ now: Date.now(), maxNotes: 1 });
    expect(first.results).toEqual(['raced']);
    expect((await stored(id)).embeddingState).toBe('stale');
    const second = await runIndexerOnce({ now: Date.now(), maxNotes: 1 });
    expect(second.results).toEqual(['indexed']);
    const chunks = await NoteChunk.find({ noteId: id }).lean();
    expect(chunks[0].text).toContain('second reading');
  });
});

describe('the content hash is remembered', () => {
  test('computed on first read, then read back until the content changes', async () => {
    const id = await sketch(['a']);
    const real = sketchContentHash(snapshot(['a']));
    expect((await st.getSketchTranscript({ noteId: id, userId: USER })).contentHash).toBe(real);
    const n = await stored(id);
    expect(n.sketchHash.value).toBe(real);
    // Proof it is read, not recomputed: a planted value comes back.
    const planted = 'f'.repeat(64);
    await Note.collection.updateOne({ _id: n._id }, { $set: { 'sketchHash.value': planted } });
    expect((await st.getSketchTranscript({ noteId: id, userId: USER })).contentHash).toBe(planted);
    // New content (new updatedAt): computed again.
    await Note.updateOne({ _id: id }, { content: snapshot(['a', 'b']) });
    expect((await st.getSketchTranscript({ noteId: id, userId: USER })).contentHash).toBe(sketchContentHash(snapshot(['a', 'b'])));
  });
});

describe('cheap refusals', () => {
  test('a locked or photo sketch is answered from its state; the image is never checked', async () => {
    const locked = await sketch(['a'], { isLocked: true });
    const photo = await Note.create({ title: 'P', type: 'handwritten', userId: USER, content: JSON.stringify({ store: { 'shape:p': { id: 'shape:p', typeName: 'shape', type: 'image', props: {} } } }) });
    for (const id of [locked, String(photo._id)]) {
      // eslint-disable-next-line no-await-in-loop
      const view = await Mutation.autoTranscribeSketch(null, { noteId: id, image: 'not an image', mediaType: 'image/gif' }, ctx);
      expect(view.status).toBe('off');
    }
    const open = await sketch(['a']);
    await expect(Mutation.autoTranscribeSketch(null, { noteId: open, image: 'not an image', mediaType: 'image/gif' }, ctx))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

describe('meaning search: cache and breaker', () => {
  test('one note\'s passages are patched into the cache, not the whole user dropped', async () => {
    const uid = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    const mine = new mongoose.Types.ObjectId();
    const { model } = (await import('../graphql/notegeek/embeddings.js')).embeddingsConfig();
    await NoteChunk.create({ userId: uid, noteId: other, chunk: 0, text: 'other', textHash: 'x', vector: [1, 0], model });
    const before = await semantic.userVectors(uid);
    expect(before.map((r) => r.text)).toEqual(['other']);
    semantic.replaceNoteVectors(uid, mine, { model, rows: [{ chunk: 0, text: 'mine', vector: [0, 1] }] });
    // Still cached (no re-read): a row only Mongo has would show up on a re-read.
    await NoteChunk.create({ userId: uid, noteId: new mongoose.Types.ObjectId(), chunk: 0, text: 'unseen', textHash: 'y', vector: [1, 1], model });
    expect((await semantic.userVectors(uid)).map((r) => r.text).sort()).toEqual(['mine', 'other']);
    semantic.dropNoteVectors(uid, other);
    expect((await semantic.userVectors(uid)).map((r) => r.text)).toEqual(['mine']);
  });

  test('a timeout trips the breaker only after three in a row; a refused connection at once', () => {
    const slow = new EmbeddingsUnavailableError('timed out', { timeout: true });
    expect(semantic.markServiceDown(slow)).toBe(0);
    expect(semantic.markServiceDown(slow)).toBe(0);
    expect(semantic.serviceIsDown()).toBe(false);
    expect(semantic.markServiceDown(slow)).toBeGreaterThan(0);
    expect(semantic.serviceIsDown()).toBe(true);
    semantic.markServiceUp();
    expect(semantic.markServiceDown(new EmbeddingsUnavailableError('ECONNREFUSED'))).toBeGreaterThan(0);
  });
});

describe('passages fit the model', () => {
  test('no passage is over MAX_CHUNK_CHARS, and nothing is cut off', () => {
    const code = Array.from({ length: 400 }, (_, i) => `const veryLongIdentifierName${ i } = computeSomething(${ i });`).join('\n');
    const chunks = chunkNote({ type: 'code', title: 'Big', content: JSON.stringify({ language: 'js', code }) });
    expect(MAX_CHUNK_CHARS).toBeLessThanOrEqual(2000);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    const joined = chunks.join(' ');
    expect(joined).toContain('veryLongIdentifierName399');
  });
});
