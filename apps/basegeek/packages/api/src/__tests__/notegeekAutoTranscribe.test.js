/**
 * Automatic sketch transcription (apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md),
 * the server half: what counts as a change, one request per sketch, older
 * results never landing on newer ones, failures that never look like success,
 * the user's corrections surviving, and the hand-off to search.
 *
 * `transcribe` is injected; no model is called.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Note from '../graphql/notegeek/models/Note.js';
import {
  autoTranscribeSketch,
  getSketchTranscript,
  rememberConvertReading,
  saveSketchTranscriptEdit,
  recordSketchTasksSent,
  transcriptView,
  AUTO_TRANSCRIBE_DAILY_CAP,
  CLAIM_STALE_MS,
} from '../graphql/notegeek/sketchTranscript.js';
import { sketchContentHash, sketchSearchText } from '../graphql/notegeek/sketchText.js';
import { chunkNote } from '../graphql/notegeek/chunking.js';
import { ensureNoteWordIndex } from '../graphql/notegeek/wordIndex.js';

const { User } = await import('../models/user.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const USER = new mongoose.Types.ObjectId().toString();
const T0 = Date.parse('2026-11-14T15:00:00Z');

/** A tldraw snapshot: shapes, plus the records that must NOT count. */
function snapshot(shapes, { camX = 0, paper = null } = {}) {
  const store = {
    'document:document': { id: 'document:document', typeName: 'document', name: '', meta: paper ? { paperColor: paper } : {} },
    'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
    'camera:page:page': { id: 'camera:page:page', typeName: 'camera', x: camX, y: 0, z: 1, meta: {} },
    'instance:instance': { id: 'instance:instance', typeName: 'instance', currentPageId: 'page:page' },
  };
  for (const s of shapes) store[s.id] = { typeName: 'shape', type: 'draw', x: 0, y: 0, rotation: 0, props: {}, ...s };
  return JSON.stringify({ store, schema: { schemaVersion: 2 } });
}
const stroke = (id, x = 0) => ({ id: `shape:${id}`, x, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }] } });

const reading = (text = 'buy milk') => jest.fn(async () => ({ text, provenance: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' } }));
const run = (noteId, transcribe, now = T0) => autoTranscribeSketch({ noteId, userId: USER, image: PNG, mediaType: 'image/png', now, transcribe });

async function sketch(content = snapshot([stroke('a')]), over = {}) {
  const note = await Note.create({ title: 'Standup', content, type: 'handwritten', userId: USER, ...over });
  return String(note._id);
}
const stored = (id) => Note.findById(id).lean();

afterEach(async () => {
  await Note.deleteMany({});
  await User.collection.deleteMany({ _id: new mongoose.Types.ObjectId(USER) }).catch(() => {});
});

describe('the content hash', () => {
  test('only what is drawn counts: camera, paper, page names and missing shapes do not', () => {
    const base = sketchContentHash(snapshot([stroke('a')]));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(sketchContentHash(snapshot([stroke('a')], { camX: 900 }))).toBe(base);
    expect(sketchContentHash(snapshot([stroke('a')], { paper: 'warm' }))).toBe(base);
    expect(sketchContentHash(snapshot([stroke('a', 40)]))).not.toBe(base);
    expect(sketchContentHash(snapshot([stroke('a'), stroke('b')]))).not.toBe(base);
    expect(sketchContentHash(snapshot([]))).toBeNull();
    expect(sketchContentHash('not json')).toBeNull();
  });
});

describe('autoTranscribeSketch', () => {
  test('a reading is stored beside the sketch, never in it, and handed to search', async () => {
    const id = await sketch();
    const before = await stored(id);
    const transcribe = reading('buy milk\n- eggs');
    const view = await run(id, transcribe);
    expect(view).toMatchObject({ status: 'searchable', current: true, text: 'buy milk\n- eggs', source: 'auto', model: 'openai/gpt-4.1-mini' });
    const after = await stored(id);
    expect(after.content).toBe(before.content);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime()); // background work is not an edit
    expect(after.wordText).toBe('buy milk\n- eggs');
    expect(after.embeddingState).toBe('stale'); // the existing indexer picks it up
    expect(chunkNote(after)[0]).toMatch(/Standup[\s\S]*buy milk/);
  });

  test('uses at most 30 of the shared transcribe cap, so Convert keeps 10', async () => {
    const id = await sketch();
    const transcribe = reading();
    await run(id, transcribe);
    expect(transcribe.mock.calls[0][0]).toMatchObject({ dailyCap: AUTO_TRANSCRIBE_DAILY_CAP, source: 'sketch' });
    expect(AUTO_TRANSCRIBE_DAILY_CAP).toBe(30);
  });

  test('unchanged content is not transcribed again', async () => {
    const id = await sketch();
    const transcribe = reading();
    await run(id, transcribe);
    await run(id, transcribe, T0 + 60_000);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  test('metadata-only changes (tags, title, paper, camera) do not trigger a transcription', async () => {
    const id = await sketch();
    const transcribe = reading();
    await run(id, transcribe);
    await Note.findOneAndUpdate({ _id: id }, { tags: ['work'], title: 'Standup 2', content: snapshot([stroke('a')], { camX: 300, paper: 'green' }), type: 'handwritten' });
    const view = await run(id, transcribe, T0 + 120_000);
    expect(view.status).toBe('searchable');
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  test('one request per sketch: a second call while one runs sends nothing', async () => {
    const id = await sketch();
    let release;
    const transcribe = jest.fn(() => new Promise((resolve) => { release = () => resolve({ text: 'x', provenance: {} }); }));
    const first = run(id, transcribe);
    await new Promise((r) => setTimeout(r, 50));
    const second = await run(id, transcribe, T0 + 1000);
    expect(second.status).toBe('transcribing');
    release();
    await first;
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  test('one request per sketch even when two calls start at the same instant (the atomic claim)', async () => {
    const id = await sketch();
    const transcribe = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { text: 'x', provenance: {} };
    });
    // Both read "waiting" before either claims; only the claim can stop the second.
    await Promise.all([run(id, transcribe, T0), run(id, transcribe, T0 + 1), run(id, transcribe, T0 + 2)]);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  test('an abandoned claim (older than 2 min) can be retaken', async () => {
    const id = await sketch();
    await Note.updateOne({ _id: id }, { $set: { 'sketchTranscript.status': 'processing', 'sketchTranscript.claimedAt': new Date(T0) } });
    const transcribe = reading();
    await run(id, transcribe, T0 + CLAIM_STALE_MS + 1000);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  test('an edit during the request marks the result stale, keeps the text, and allows the next run', async () => {
    const id = await sketch();
    const transcribe = jest.fn(async () => {
      // The writer adds a stroke while the model is reading.
      await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('b')]), type: 'handwritten' });
      return { text: 'first half', provenance: {} };
    });
    const view = await run(id, transcribe);
    expect(view.status).toBe('waiting');
    const after = await stored(id);
    expect(after.sketchTranscript.status).toBe('stale');
    expect(after.wordText).toBe('first half'); // better than nothing until the rerun
    const second = reading('first half and second');
    expect((await run(id, second, T0 + 120_000)).status).toBe('searchable');
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('an older result never overwrites a newer one', async () => {
    const id = await sketch();
    const transcribe = jest.fn(async () => {
      // Meanwhile a newer claim took over (an abandoned claim retaken) and finished.
      await Note.updateOne({ _id: id }, { $set: { 'sketchTranscript.submittedHash': 'f'.repeat(64), 'sketchTranscript.text': 'newer', 'sketchTranscript.hash': 'f'.repeat(64) } });
      return { text: 'older', provenance: {} };
    });
    await run(id, transcribe);
    expect((await stored(id)).sketchTranscript.text).toBe('newer');
  });

  test('a transient failure backs off, is never searchable, and keeps the old text', async () => {
    const id = await sketch();
    await run(id, reading('old reading'));
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('b')]), type: 'handwritten' });
    const down = jest.fn(async () => { const e = new Error('unavailable'); e.extensions = { code: 'AI_UNAVAILABLE' }; throw e; });
    const view = await run(id, down, T0 + 200_000);
    expect(view.status).toBe('retry');
    expect(view.current).toBe(false);
    expect(view.retryAt).toBe(new Date(T0 + 200_000 + 2 * 60 * 1000).toISOString());
    const after = await stored(id);
    expect(after.sketchTranscript.text).toBe('old reading');
    expect(after.wordText).toBe('old reading');
    // Before retryAt: nothing is sent.
    await run(id, down, T0 + 230_000);
    expect(down).toHaveBeenCalledTimes(1);
    // After it: one more try.
    await run(id, reading('new'), T0 + 200_000 + 3 * 60 * 1000);
    expect((await stored(id)).sketchTranscript.text).toBe('new');
  });

  test("today's cap waits for the next UTC day", async () => {
    const id = await sketch();
    const capped = jest.fn(async () => { const e = new Error('cap'); e.extensions = { code: 'AI_CAP' }; throw e; });
    const view = await run(id, capped);
    expect(view).toMatchObject({ status: 'retry', retryAt: '2026-11-15T00:00:00.000Z' });
  });

  test('a permanent failure is not retried until the content changes', async () => {
    const id = await sketch();
    const garbled = jest.fn(async () => { const e = new Error('degenerate'); e.extensions = { code: 'AI_DEGENERATE' }; throw e; });
    expect((await run(id, garbled)).status).toBe('failed');
    await run(id, garbled, T0 + 10 * 60 * 60 * 1000);
    expect(garbled).toHaveBeenCalledTimes(1);
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('c')]), type: 'handwritten' });
    expect((await run(id, reading(), T0 + 10 * 60 * 60 * 1000)).status).toBe('searchable');
  });

  test('switched off in Settings: nothing is sent', async () => {
    const id = await sketch();
    await User.collection.insertOne({
      _id: new mongoose.Types.ObjectId(USER), appPreferences: { notegeek: { autoTranscribeSketches: false } },
    });
    const transcribe = reading();
    const view = await run(id, transcribe);
    expect(view).toMatchObject({ autoEnabled: false, status: 'waiting' });
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('locked, encrypted, photo-page and empty sketches are never sent', async () => {
    const transcribe = reading();
    const photo = snapshot([{ id: 'shape:p', type: 'image', props: { assetId: 'asset:1' } }]);
    for (const id of [
      await sketch(undefined, { isEncrypted: true }),
      await sketch(undefined, { isLocked: true }),
      await sketch(photo),
      await sketch(snapshot([])),
    ]) {
      expect(['off', 'empty']).toContain((await run(id, transcribe)).status);
    }
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("someone else's sketch is not found", async () => {
    const id = await sketch(undefined, { userId: new mongoose.Types.ObjectId() });
    await expect(run(id, reading())).rejects.toThrow(/not found/i);
  });
});

describe("the user's corrections", () => {
  test('are kept for their content, win in Convert, and survive automatic runs', async () => {
    const id = await sketch();
    await run(id, reading('by milk'));
    const { contentHash } = await getSketchTranscript({ noteId: id, userId: USER, now: T0 });
    const view = await saveSketchTranscriptEdit({ noteId: id, userId: USER, text: 'buy milk', forHash: contentHash, now: T0 });
    expect(view).toMatchObject({ status: 'searchable', text: 'buy milk', edited: true, source: 'user' });
    // The sketch changes; the next automatic reading must not touch the corrections.
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('b')]), type: 'handwritten' });
    await run(id, reading('by milk\neggs'), T0 + 300_000);
    const after = await stored(id);
    expect(after.sketchTranscript.edited.text).toBe('buy milk');
    // Both stay searchable: the corrections and the new reading.
    expect(after.wordText).toBe('by milk\neggs\n\nbuy milk');
  });
});

describe('photographed pages (Chef, 2026-11-14: 1b + 2a)', () => {
  test("the reviewed text is kept on the photo note, stays searchable after markup, and is never re-read", async () => {
    const photo = snapshot([{ id: 'shape:p', type: 'image', props: { assetId: 'asset:1' } }]);
    const id = await sketch(photo);
    const view = await saveSketchTranscriptEdit({ noteId: id, userId: USER, text: 'page one words', now: T0 });
    expect(view).toMatchObject({ status: 'searchable', text: 'page one words', edited: true });
    expect((await stored(id)).wordText).toBe('page one words');
    // S Pen markup on the photo changes the hash: no automatic reading, text kept.
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([{ id: 'shape:p', type: 'image', props: { assetId: 'asset:1' } }, stroke('ink')]), type: 'handwritten' });
    const transcribe = reading();
    expect((await run(id, transcribe, T0 + 300_000)).status).toBe('off');
    expect(transcribe).not.toHaveBeenCalled();
    expect((await stored(id)).wordText).toBe('page one words');
  });
});

describe('Convert keeps its reading for the sketch', () => {
  test("a Convert reading is stored, and the automatic run doesn't pay for the same content", async () => {
    const id = await sketch();
    await rememberConvertReading({ noteId: id, userId: USER, text: 'from convert', provenance: { model: 'm' }, now: T0 });
    const transcribe = reading();
    const view = await run(id, transcribe, T0 + 1000);
    expect(view).toMatchObject({ status: 'searchable', text: 'from convert', source: 'convert' });
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe('word search reads wordText, never sketch JSON', () => {
  test('a markdown note indexes its content; a sketch indexes only its transcript', async () => {
    const md = await Note.create({ title: 'Roof', content: 'call the roofer', type: 'markdown', userId: USER });
    expect((await stored(md._id)).wordText).toBe('call the roofer');
    await Note.findOneAndUpdate({ _id: md._id }, { content: 'call the roofer back' });
    expect((await stored(md._id)).wordText).toBe('call the roofer back');
    const id = await sketch();
    expect((await stored(id)).wordText).toBe('');
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('z')]), type: 'handwritten' });
    expect((await stored(id)).wordText).toBe('');
  });

  test('ensureNoteWordIndex swaps the old { title, content, tags } index and backfills', async () => {
    const coll = Note.collection;
    await Note.syncIndexes().catch(() => {});
    for (const idx of await coll.indexes()) if (idx.key?._fts) await coll.dropIndex(idx.name);
    await coll.createIndex({ title: 'text', content: 'text', tags: 'text' });
    await coll.insertOne({ title: 'Old', content: 'garage door opener', type: 'markdown', userId: new mongoose.Types.ObjectId(USER), tags: [] });
    await coll.insertOne({ title: 'Old sketch', content: snapshot([stroke('a')]), type: 'handwritten', userId: new mongoose.Types.ObjectId(USER), tags: [] });

    const result = await ensureNoteWordIndex();
    expect(result).toMatchObject({ filled: 1, sketches: 1, dropped: 1, created: true });
    const text = (await coll.indexes()).filter((i) => i.key?._fts);
    expect(text).toHaveLength(1);
    expect(Object.keys(text[0].weights).sort()).toEqual(['tags', 'title', 'wordText']);
    // "draw" and "shape" no longer match the sketch's JSON; the markdown words still match.
    expect(await Note.countDocuments({ $text: { $search: 'shape' } })).toBe(0);
    expect(await Note.countDocuments({ $text: { $search: 'garage' } })).toBe(1);
    // Idempotent.
    expect(await ensureNoteWordIndex()).toMatchObject({ filled: 0, sketches: 0, dropped: 0, created: false });
  });
});

describe('journal lines sent to TodoGeek (BUJO_HANDWRITING.md)', () => {
  test('sent line keys are remembered per sketch, deduped, and survive a new reading', async () => {
    const id = await sketch();
    let view = await recordSketchTasksSent({ noteId: id, userId: USER, keys: ['k1', 'k2'], now: T0 });
    expect(view.sentTaskKeys).toEqual(['k1', 'k2']);
    view = await recordSketchTasksSent({ noteId: id, userId: USER, keys: ['k2', 'k3'], now: T0 });
    expect(view.sentTaskKeys).toEqual(['k1', 'k2', 'k3']);
    await run(id, reading('* buy milk'));
    expect((await stored(id)).sketchTranscript.sentTaskKeys).toEqual(['k1', 'k2', 'k3']);
    expect((await stored(id)).updatedAt.getTime()).toBe((await stored(id)).createdAt.getTime());
  });

  test("someone else's sketch, or a note that is not a sketch, is refused", async () => {
    const theirs = await sketch(undefined, { userId: new mongoose.Types.ObjectId() });
    await expect(recordSketchTasksSent({ noteId: theirs, userId: USER, keys: ['k'] })).rejects.toThrow(/not found/i);
    const md = await Note.create({ title: 'm', content: 'x', type: 'markdown', userId: USER });
    await expect(recordSketchTasksSent({ noteId: String(md._id), userId: USER, keys: ['k'] })).rejects.toThrow(/sketch/i);
  });
});

test('sketchSearchText ignores an empty page and repeats', () => {
  expect(sketchSearchText({ text: '[no writing]' })).toBe('');
  expect(sketchSearchText({ text: 'a', edited: { text: 'a' } })).toBe('a');
  expect(transcriptView({ type: 'markdown', content: 'x' }).status).toBe('empty');
});
