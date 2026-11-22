/**
 * Reading sketches nobody has open (AUTO_TRANSCRIBE_SPEC.md, "Background
 * reader", 2026-11-22): which sketches the gateway hands a browser to draw,
 * and the template sheet that used to switch reading off altogether.
 *
 * `transcribe` is injected; no model is called.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Note from '../graphql/notegeek/models/Note.js';
import {
  autoTranscribeSketch,
  getSketchTranscript,
  sketchesToTranscribe,
  AUTO_TRANSCRIBE_DAILY_CAP,
  BACKGROUND_DAILY_CAP,
  QUIET_MS,
} from '../graphql/notegeek/sketchTranscript.js';
import { sketchContentHash, hasPhotoPages, hasAnyShape } from '../graphql/notegeek/sketchText.js';

const { User } = await import('../models/user.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const USER = new mongoose.Types.ObjectId().toString();

function snapshot(records) {
  const store = {
    'document:document': { id: 'document:document', typeName: 'document', name: '', meta: { paperTemplate: 'grid' } },
    'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
  };
  for (const r of records) store[r.id] = { typeName: 'shape', type: 'draw', x: 0, y: 0, rotation: 0, props: {}, ...r };
  return JSON.stringify({ store, schema: { schemaVersion: 2 } });
}
const stroke = (id, x = 0) => ({ id: `shape:${id}`, x, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }] } });
const SHEET = [
  { id: 'asset:paper-template', typeName: 'asset', type: 'image', props: { src: 'data:image/svg+xml,…' }, meta: { paperTemplate: 'oneonone' } },
  { id: 'shape:paper-template', type: 'image', isLocked: true, props: { assetId: 'asset:paper-template' }, meta: { paperTemplate: 'oneonone' } },
];
const photo = () => snapshot([{ id: 'shape:p', type: 'image', props: { assetId: 'asset:1' } }, stroke('markup')]);

const reading = (text = 'ask about the migration') => jest.fn(async () => ({ text, provenance: { provider: 'openrouter', model: 'm' } }));
async function sketch(content = snapshot([stroke('a')]), over = {}) {
  const note = await Note.create({ title: 'Page', content, type: 'handwritten', userId: USER, ...over });
  return String(note._id);
}
/** Well after every note here was last saved. */
const later = () => Date.now() + 10 * 60 * 1000;
const waiting = (opts = {}) => sketchesToTranscribe({ userId: USER, now: later(), ...opts });
const run = (noteId, transcribe, over = {}) => autoTranscribeSketch({ noteId, userId: USER, image: PNG, mediaType: 'image/png', transcribe, ...over });

afterEach(async () => {
  await Note.deleteMany({});
  await User.collection.deleteMany({ _id: new mongoose.Types.ObjectId(USER) }).catch(() => {});
});

describe('a template sheet is paper, not writing', () => {
  test('it is not in the hash, is not a photographed page, and alone is an empty page', () => {
    const ink = snapshot([stroke('a')]);
    const onSheet = snapshot([...SHEET, stroke('a')]);
    expect(sketchContentHash(onSheet)).toBe(sketchContentHash(ink));
    expect(hasPhotoPages(onSheet)).toBe(false);
    expect(sketchContentHash(snapshot(SHEET))).toBe(null);
    expect(hasAnyShape(snapshot(SHEET))).toBe(false);
    expect(hasAnyShape(onSheet)).toBe(true);
    expect(hasAnyShape(ink)).toBe(true);
    // A real photographed page still is one.
    expect(hasPhotoPages(photo())).toBe(true);
  });

  test('a sketch on a sheet is read (it was "off" until 2026-11-22); a sheet with no ink is empty', async () => {
    const id = await sketch(snapshot([...SHEET, stroke('a')]));
    expect((await getSketchTranscript({ noteId: id, userId: USER })).status).toBe('waiting');
    const transcribe = reading();
    expect((await run(id, transcribe)).status).toBe('searchable');
    expect(transcribe).toHaveBeenCalledTimes(1);

    const blank = await sketch(snapshot(SHEET));
    expect((await getSketchTranscript({ noteId: blank, userId: USER })).status).toBe('empty');
  });

  test('a hash remembered under the old rule is not trusted for a page with a sheet', async () => {
    const id = await sketch(snapshot(SHEET));
    const note = await Note.findById(id).lean();
    await Note.updateOne({ _id: id }, { $set: { sketchHash: { value: 'old-rule-hash', len: note.content.length, at: note.updatedAt } } }, { timestamps: false });
    expect((await getSketchTranscript({ noteId: id, userId: USER })).status).toBe('empty');
    expect((await Note.findById(id).lean()).sketchHash).toMatchObject({ value: null, v: 2 });
  });
});

describe('sketchesToTranscribe', () => {
  test('hands back unread sketches, newest first, and none that are settled', async () => {
    const old = await sketch();
    await Note.updateOne({ _id: old }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } }, { timestamps: false });
    const fresh = await sketch(snapshot([stroke('b')]));
    const read = await sketch(snapshot([stroke('c')]));
    await run(read, reading());
    await sketch(snapshot(SHEET)); // nothing written
    await sketch(snapshot([]));
    await sketch(photo()); // photographed pages keep manual Convert
    await sketch(undefined, { isLocked: true });
    await sketch(undefined, { deletedAt: new Date() });
    await sketch(undefined, { userId: new mongoose.Types.ObjectId() });
    await Note.create({ title: 'm', content: 'words', type: 'markdown', userId: USER });

    expect(await waiting()).toEqual([fresh, old]);
    // Asked again, the same answer: and the settled ones were each loaded once.
    expect(await waiting()).toEqual([fresh, old]);
    const settled = await Note.find({ userId: USER, type: 'handwritten', _id: { $nin: [fresh, old] }, deletedAt: null, isLocked: { $ne: true } }).lean();
    for (const note of settled) expect(note.sketchHash?.at?.getTime()).toBe(note.updatedAt.getTime());
  });

  test('a page still being written on is left alone for 90 seconds', async () => {
    const id = await sketch();
    const saved = (await Note.findById(id).lean()).updatedAt.getTime();
    expect(await sketchesToTranscribe({ userId: USER, now: saved + QUIET_MS - 1000 })).toEqual([]);
    expect(await sketchesToTranscribe({ userId: USER, now: saved + QUIET_MS + 1000 })).toEqual([id]);
  });

  test('once read it is gone; edited again it is back', async () => {
    const id = await sketch();
    await run(id, reading(), { background: true });
    expect(await waiting()).toEqual([]);
    await Note.findOneAndUpdate({ _id: id }, { content: snapshot([stroke('a'), stroke('more', 40)]) });
    expect(await waiting()).toEqual([id]);
  });

  test('a page that is backing off or was given up on is not offered', async () => {
    const backingOff = await sketch();
    const down = jest.fn(async () => { throw Object.assign(new Error('down'), { extensions: { code: 'AI_UNAVAILABLE' } }); });
    const view = await run(backingOff, down);
    expect(view.status).toBe('retry');
    expect(await sketchesToTranscribe({ userId: USER, now: Date.parse(view.retryAt) - 1000, quietMs: -3600_000 })).toEqual([]);
    expect(await sketchesToTranscribe({ userId: USER, now: Date.parse(view.retryAt) + 1000, quietMs: -3600_000 })).toEqual([backingOff]);

    await Note.deleteMany({});
    const hopeless = await sketch();
    const empty = jest.fn(async () => { throw Object.assign(new Error('nothing'), { extensions: { code: 'AI_EMPTY' } }); });
    expect((await run(hopeless, empty)).status).toBe('failed');
    expect(await waiting()).toEqual([]);
  });

  test('a photo sketch whose hash was remembered before `photo` was is marked, not loaded for ever', async () => {
    const id = await sketch(photo());
    await getSketchTranscript({ noteId: id, userId: USER });
    await Note.updateOne({ _id: id }, { $unset: { 'sketchHash.photo': 1 } }, { timestamps: false });
    expect(await waiting()).toEqual([]);
    expect((await Note.findById(id).lean()).sketchHash.photo).toBe(true);
  });

  test('limit is honoured (1 to 10)', async () => {
    for (let i = 0; i < 4; i += 1) await sketch(snapshot([stroke(`s${i}`, i)]));
    expect(await waiting({ limit: 2 })).toHaveLength(2);
    expect(await waiting()).toHaveLength(3);
    expect(await waiting({ limit: 99 })).toHaveLength(4);
  });

  test('switched off in Settings: nothing is offered', async () => {
    await User.collection.insertOne({ _id: new mongoose.Types.ObjectId(USER), appPreferences: { notegeek: { autoTranscribeSketches: false } } });
    await sketch();
    expect(await waiting()).toEqual([]);
  });
});

test('a background read stops at 20 of the day, the open page at 30', async () => {
  const a = await sketch();
  const b = await sketch(snapshot([stroke('b')]));
  const transcribe = reading();
  await run(a, transcribe, { background: true });
  await run(b, transcribe);
  expect(transcribe.mock.calls[0][0].dailyCap).toBe(BACKGROUND_DAILY_CAP);
  expect(transcribe.mock.calls[1][0].dailyCap).toBe(AUTO_TRANSCRIBE_DAILY_CAP);
  expect(BACKGROUND_DAILY_CAP).toBeLessThan(AUTO_TRANSCRIBE_DAILY_CAP);
});

describe('a sketch on a template is read as a form (TEMPLATES_SPEC T6, 2026-11-22)', () => {
  test('the form prompt reads it, a plain sketch keeps the sketch prompt', async () => {
    const onSheet = await sketch(snapshot([...SHEET, stroke('a')]));
    const plain = await sketch(snapshot([stroke('b')]));
    const transcribe = reading('§ ACTIONS\n[ ] send the doc');
    await run(onSheet, transcribe);
    await run(plain, transcribe);
    expect(transcribe.mock.calls[0][0].source).toBe('form');
    expect(transcribe.mock.calls[1][0].source).toBe('sketch');
  });

  test("the form's headings are kept in the reading and left out of search", async () => {
    const id = await sketch(snapshot([...SHEET, stroke('a')]));
    const view = await run(id, reading('§ THEIR TOPICS\npromo timeline\n§ ACTIONS\n[ ] send the doc'));
    expect(view.text).toMatch(/^§ THEIR TOPICS/);
    const note = await Note.findById(id).lean();
    expect(note.wordText).toBe('promo timeline\n[ ] send the doc');
    expect(note.wordText).not.toMatch(/ACTIONS|TOPICS/);
  });
});
