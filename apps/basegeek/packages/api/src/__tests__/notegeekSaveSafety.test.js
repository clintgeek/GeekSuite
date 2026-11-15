/**
 * NoteGeek save safety (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md, gateway half):
 *   C3  updateNote(baseUpdatedAt): a stale edit is refused with CONFLICT and
 *       the server's copy — atomically, in the write itself.
 *   C4  soft delete (decision D1): Recently deleted, restore, purge, 30 days.
 *   C5  recordSketchTasksSent: $addToSet, so overlapping sends both land.
 *   C6  createNote(transcriptText): a photo note is searchable from its first write.
 *   1.5 history: coalesced edits, daily/weekly thinning, caps, the pre-shrink keep.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteVersion, MAX_VERSIONS_PER_NOTE } = await import('../graphql/notegeek/models/NoteVersion.js');
const { default: NoteChunk } = await import('../graphql/notegeek/models/NoteChunk.js');
const { userGeekConn } = await import('../models/user.js');
const { resolvers, purgeExpiredNotes, DELETED_RETENTION_MS } = await import('../graphql/notegeek/resolvers.js');
const versions = await import('../graphql/notegeek/versions.js');
const { recordSketchTasksSent } = await import('../graphql/notegeek/sketchTranscript.js');
const { sketchContentHash } = await import('../graphql/notegeek/sketchText.js');
const { resolvers: glanceResolvers } = await import('../graphql/glance/resolvers.js');

const { Query, Mutation } = resolvers;
const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const MIN = 60 * 1000;

const make = (overrides = {}) =>
  Note.create({ title: 'A note', content: 'body text', type: 'markdown', userId: ALICE, ...overrides });
const backdate = (id, ms) => Note.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) }, { $set: { updatedAt: new Date(Date.now() - ms) } });
const iso = (d) => new Date(d).toISOString();

function snapshot(shapes) {
  const store = { 'document:document': { id: 'document:document', typeName: 'document', meta: {} } };
  for (const s of shapes) store[s.id] = { typeName: 'shape', type: 'draw', x: 0, y: 0, props: {}, ...s };
  return JSON.stringify({ store, schema: { schemaVersion: 2 } });
}
const stroke = (id, x = 0) => ({ id: `shape:${ id }`, x });

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
  await Note.deleteMany({});
  await NoteVersion.deleteMany({});
  await NoteChunk.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
});

// ── C3 ─────────────────────────────────────────────────────────────────────
describe('C3: updateNote with baseUpdatedAt', () => {
  test('the base it was made against: written', async () => {
    const n = await make();
    const out = await Mutation.updateNote(null, { id: String(n._id), content: 'mine', baseUpdatedAt: iso(n.updatedAt) }, ctx(ALICE));
    expect(out.content).toBe('mine');
  });

  test('an older base: CONFLICT with the server copy, and nothing written', async () => {
    const n = await make({ title: 'T', tags: ['x'] });
    const stale = iso(n.updatedAt);
    // Another device saved since.
    await Note.collection.updateOne({ _id: n._id }, { $set: { content: 'from the phone', updatedAt: new Date(Date.now() + 1000) } });
    const fresh = await Note.findById(n._id).lean();
    const err = await Mutation.updateNote(null, { id: String(n._id), content: 'old tablet body', baseUpdatedAt: stale }, ctx(ALICE)).catch((e) => e);
    expect(err.extensions.code).toBe('CONFLICT');
    expect(err.extensions.serverNote).toEqual({
      id: String(n._id), title: 'T', content: 'from the phone', tags: ['x'], type: 'markdown', updatedAt: iso(fresh.updatedAt),
    });
    expect((await Note.findById(n._id).lean()).content).toBe('from the phone');
  });

  test('atomic: a save landing between the read and the write is not overwritten', async () => {
    const n = await make();
    const base = iso(n.updatedAt);
    // The resolver's read sees the base; then another device saves before the write.
    const realFindOne = Note.findOne.bind(Note);
    let raced = false;
    jest.spyOn(Note, 'findOne').mockImplementation((...args) => {
      const q = realFindOne(...args);
      if (!raced) {
        raced = true;
        const exec = q.exec.bind(q);
        q.exec = async () => {
          const doc = await exec();
          await Note.collection.updateOne({ _id: n._id }, { $set: { content: 'phone wins', updatedAt: new Date(Date.now() + 5000) } });
          return doc;
        };
      }
      return q;
    });
    const err = await Mutation.updateNote(null, { id: String(n._id), content: 'tablet', type: 'markdown', baseUpdatedAt: base }, ctx(ALICE)).catch((e) => e);
    expect(err?.extensions?.code).toBe('CONFLICT');
    expect(err.extensions.serverNote.content).toBe('phone wins');
    expect((await Note.collection.findOne({ _id: n._id })).content).toBe('phone wins');
  });

  test('no base: last write wins, as before (old tabs)', async () => {
    const n = await make();
    await Note.updateOne({ _id: n._id }, { content: 'elsewhere' });
    const out = await Mutation.updateNote(null, { id: String(n._id), content: 'old tab' }, ctx(ALICE));
    expect(out.content).toBe('old tab');
  });

  test('a stranger gets not-found, never the CONFLICT copy', async () => {
    const n = await make();
    const err = await Mutation.updateNote(null, { id: String(n._id), content: 'x', baseUpdatedAt: '2020-01-01T00:00:00.000Z' }, ctx(BOB)).catch((e) => e);
    expect(err.message).toMatch(/not found/);
    expect(err.extensions?.serverNote).toBeUndefined();
  });
});

// ── C4 ─────────────────────────────────────────────────────────────────────
describe('C4: soft delete', () => {
  test('a deleted note leaves lists, tags, counts, search and glance, keeps its history, and opens by id', async () => {
    const keep = await make({ title: 'Keep', tags: ['k'], content: 'shared words' });
    const gone = await make({ title: 'Gone', tags: ['g'], content: 'shared words' });
    await backdate(gone._id, 20 * MIN);
    await Mutation.updateNote(null, { id: String(gone._id), content: 'shared words again' }, ctx(ALICE));
    expect(await NoteVersion.countDocuments({ noteId: gone._id })).toBe(1);

    expect(await Mutation.deleteNote(null, { id: String(gone._id) }, ctx(ALICE))).toBe(true);
    const ids = (rows) => rows.map((r) => String(r._id ?? r.id));
    expect(ids(await Query.notes(null, {}, ctx(ALICE)))).toEqual([String(keep._id)]);
    expect(ids((await Query.notesPage(null, {}, ctx(ALICE))).notes)).toEqual([String(keep._id)]);
    expect(await Query.noteTags(null, {}, ctx(ALICE))).toEqual(['k']);
    expect((await Query.noteTagUsage(null, { tag: 'g' }, ctx(ALICE))).notes).toBe(0);
    expect(ids(await Query.searchNotes(null, { q: 'shared' }, ctx(ALICE)))).toEqual([String(keep._id)]);
    expect((await Query.noteTitles(null, { q: 'Gone' }, ctx(ALICE)))).toEqual([]);
    const today = await glanceResolvers.Query.glanceToday(null, {}, ctx(ALICE));
    expect(today.recentNotes.map((n) => n.title)).toEqual(['Keep']);

    const opened = await Query.note(null, { id: String(gone._id) }, ctx(ALICE));
    expect(resolvers.Note.deletedAt(opened)).toMatch(/^\d{4}-/);
    expect(await NoteVersion.countDocuments({ noteId: gone._id })).toBe(1);
    expect(ids(await Query.deletedNotes(null, {}, ctx(ALICE)))).toEqual([String(gone._id)]);
  });

  test('restore brings it back as it was, queued for meaning search', async () => {
    const n = await make({ title: 'Back' });
    await Note.updateOne({ _id: n._id }, { $set: { embeddingState: 'indexed' } }, { timestamps: false });
    const before = await Note.findById(n._id).lean();
    await Mutation.deleteNote(null, { id: String(n._id) }, ctx(ALICE));
    const restored = await Mutation.restoreNote(null, { id: String(n._id) }, ctx(ALICE));
    expect(restored.deletedAt).toBeNull();
    const after = await Note.findById(n._id).lean();
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.embeddingState).toBe('stale');
    expect((await Query.notes(null, {}, ctx(ALICE))).map((r) => r.title)).toEqual(['Back']);
    expect(await Query.deletedNotes(null, {}, ctx(ALICE))).toEqual([]);
  });

  test('links: a deleted note is no link target; restore resolves it again', async () => {
    const target = await make({ title: 'Target' });
    const src = await Mutation.createNote(null, { title: 'Src', content: 'see [[Target]]', type: 'markdown' }, ctx(ALICE));
    const link = async () => (await Note.findById(src._id).lean()).links[0]?.noteId;
    expect(String(await link())).toBe(String(target._id));
    await Mutation.deleteNote(null, { id: String(target._id) }, ctx(ALICE));
    expect(await link()).toBeNull();
    // A note written while Target is deleted waits for it rather than linking to the deleted one.
    const later = await Mutation.createNote(null, { title: 'Later', content: 'also [[Target]]', type: 'markdown' }, ctx(ALICE));
    expect((await Note.findById(later._id).lean()).links[0].noteId).toBeNull();
    await Mutation.restoreNote(null, { id: String(target._id) }, ctx(ALICE));
    expect(String(await link())).toBe(String(target._id));
    expect(String((await Note.findById(later._id).lean()).links[0].noteId)).toBe(String(target._id));
  });

  test('purgeNote removes only a deleted note, with its versions and passages', async () => {
    const live = await make();
    expect(await Mutation.purgeNote(null, { id: String(live._id) }, ctx(ALICE))).toBe(false);
    expect(await Note.exists({ _id: live._id })).toBeTruthy();

    const n = await make();
    await versions.snapshotNote(await Note.findById(n._id).lean());
    await NoteChunk.create({ userId: ALICE, noteId: n._id, chunk: 0, text: 't', textHash: 'h', vector: [1], model: 'm' });
    await Mutation.deleteNote(null, { id: String(n._id) }, ctx(ALICE));
    expect(await Mutation.purgeNote(null, { id: String(n._id) }, ctx(BOB))).toBe(false);
    expect(await Mutation.purgeNote(null, { id: String(n._id) }, ctx(ALICE))).toBe(true);
    expect(await Note.exists({ _id: n._id })).toBeNull();
    expect(await NoteVersion.countDocuments({ noteId: n._id })).toBe(0);
    expect(await NoteChunk.countDocuments({ noteId: n._id })).toBe(0);
  });

  test('notes deleted over 30 days ago are purged lazily; younger ones stay', async () => {
    const old = await make({ title: 'Old' });
    const young = await make({ title: 'Young' });
    await Note.collection.updateOne({ _id: old._id }, { $set: { deletedAt: new Date(Date.now() - DELETED_RETENTION_MS - MIN) } });
    await Note.collection.updateOne({ _id: young._id }, { $set: { deletedAt: new Date(Date.now() - DELETED_RETENTION_MS + 60 * MIN) } });
    const rows = await Query.deletedNotes(null, {}, ctx(ALICE));
    expect(rows.map((r) => r.title)).toEqual(['Young']);
    expect(await Note.exists({ _id: old._id })).toBeNull();
    expect(await purgeExpiredNotes(String(ALICE))).toBe(0);
  });

  test('deleting twice is a no-op; a stranger cannot delete or restore', async () => {
    const n = await make();
    await Mutation.deleteNote(null, { id: String(n._id) }, ctx(ALICE));
    expect(await Mutation.deleteNote(null, { id: String(n._id) }, ctx(ALICE))).toBe(true);
    await expect(Mutation.deleteNote(null, { id: String(n._id) }, ctx(BOB))).rejects.toThrow(/not found/);
    await expect(Mutation.restoreNote(null, { id: String(n._id) }, ctx(BOB))).rejects.toThrow(/not found/);
  });
});

// ── C5 ─────────────────────────────────────────────────────────────────────
describe('C5: sent journal lines', () => {
  test('two overlapping sends both land ($addToSet, not read-merge-$set)', async () => {
    const n = await make({ type: 'handwritten', content: snapshot([stroke('a')]) });
    await Promise.all([
      recordSketchTasksSent({ noteId: String(n._id), userId: String(ALICE), keys: ['a1', 'a2'] }),
      recordSketchTasksSent({ noteId: String(n._id), userId: String(ALICE), keys: ['b1'] }),
      recordSketchTasksSent({ noteId: String(n._id), userId: String(ALICE), keys: ['c1', 'a1'] }),
    ]);
    const keys = (await Note.findById(n._id).lean()).sketchTranscript.sentTaskKeys;
    expect([...keys].sort()).toEqual(['a1', 'a2', 'b1', 'c1']);
  });

  test('the sent text is kept (optional), deduped and whitespace-collapsed', async () => {
    const n = await make({ type: 'handwritten', content: snapshot([stroke('a')]) });
    const view = await Mutation.recordSketchTasksSent(null, { noteId: String(n._id), keys: ['k'], texts: ['call  Bob', 'call Bob'] }, ctx(ALICE));
    expect(view.sentTaskKeys).toEqual(['k']);
    expect(view.sentTaskTexts).toEqual(['call Bob']);
  });
});

// ── C6 ─────────────────────────────────────────────────────────────────────
describe('C6: createNote with the reviewed reading', () => {
  test('a photo note is word-searchable from its first write', async () => {
    const content = snapshot([{ id: 'shape:p', type: 'image', props: { assetId: 'asset:1' } }]);
    const note = await Mutation.createNote(null, { title: 'Page', content, type: 'handwritten', transcriptText: 'quarterly widget forecast' }, ctx(ALICE));
    const stored = await Note.findById(note._id).lean();
    expect(stored.sketchTranscript.edited.text).toBe('quarterly widget forecast');
    expect(stored.sketchTranscript.edited.hash).toBe(sketchContentHash(content));
    expect(stored.wordText).toBe('quarterly widget forecast');
    expect(stored.preview).toBe('quarterly widget forecast');
    const hits = await Query.searchNotes(null, { q: 'widget' }, ctx(ALICE));
    expect(hits.map((h) => String(h._id))).toEqual([String(note._id)]);
  });

  test('only a sketch takes one', async () => {
    await expect(Mutation.createNote(null, { content: 'x', type: 'markdown', transcriptText: 'y' }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test('updateNote(transcriptText) keeps the reading for the saved content', async () => {
    const n = await make({ type: 'handwritten', content: snapshot([stroke('a')]) });
    await Mutation.updateNote(null, { id: String(n._id), content: snapshot([stroke('a'), stroke('b')]), type: 'handwritten', transcriptText: 'blue heron' }, ctx(ALICE));
    const stored = await Note.findById(n._id).lean();
    expect(stored.wordText).toBe('blue heron');
    expect(stored.sketchTranscript.edited.hash).toBe(sketchContentHash(snapshot([stroke('a'), stroke('b')])));
  });
});

// ── 1.5 ────────────────────────────────────────────────────────────────────
describe('1.5: coalesced history', () => {
  const edit = (n, content) => Mutation.updateNote(null, { id: String(n._id), content }, ctx(ALICE));
  const count = (n) => NoteVersion.countDocuments({ noteId: n._id });

  test('continuous typing makes one version, not one per autosave', async () => {
    const n = await make();
    for (let i = 0; i < 20; i += 1) await edit(n, `typing ${ i }`); // eslint-disable-line no-await-in-loop
    expect(await count(n)).toBe(1);
  });

  test('a new session (a pause over 10 minutes) snapshots the note as it was', async () => {
    const n = await make({ content: 'monday' });
    await edit(n, 'monday + more');
    await backdate(n._id, 11 * MIN);
    await edit(n, 'tuesday');
    const list = await NoteVersion.find({ noteId: n._id }).sort({ createdAt: 1 }).lean();
    expect(list.map((v) => v.content)).toEqual(['monday', 'monday + more']);
  });

  test('during a long session, one more version once the newest is 10 minutes old', async () => {
    const n = await make();
    await edit(n, 'one');
    await NoteVersion.collection.updateMany({ noteId: n._id }, { $set: { createdAt: new Date(Date.now() - 10 * MIN - 1000) } });
    await edit(n, 'two');
    expect(await count(n)).toBe(2);
  });

  test('the note before a large shrink is always kept, and never pruned', async () => {
    const long = 'x'.repeat(1000);
    const n = await make({ content: long });
    await edit(n, `${ long }!`);
    await edit(n, 'oops'); // select-all-delete moments later
    const kept = await NoteVersion.find({ noteId: n._id, keep: true }).lean();
    expect(kept.map((v) => v.content)).toEqual([`${ long }!`]);
    // Ancient, and over every cap: still there.
    await NoteVersion.collection.updateMany({ _id: kept[0]._id }, { $set: { createdAt: new Date(Date.now() - 400 * 24 * 60 * MIN) } });
    await versions.pruneVersions(n._id, { maxBytes: 1 });
    expect(await NoteVersion.exists({ _id: kept[0]._id })).toBeTruthy();
  });

  test('compose and restore always snapshot', async () => {
    const n = await make();
    await edit(n, 'a');
    await Mutation.updateNote(null, { id: String(n._id), content: 'composed', changeReason: 'compose' }, ctx(ALICE));
    expect(await count(n)).toBe(2);
  });

  describe('retention (versionsToPrune)', () => {
    const NOW = Date.parse('2026-11-15T12:00:00Z');
    const H = 60 * MIN;
    const D = 24 * H;
    let seq = 0;
    const row = (ageMs, over = {}) => ({ _id: `v${ seq++ }`, createdAt: new Date(NOW - ageMs), size: 10, keep: false, ...over });

    test('the last day whole; then the newest of each day for 30 days; then one a week', () => {
      const rows = [
        row(1 * H), row(5 * H), row(20 * H), // today: all kept
        row(2 * D + 1 * H), row(2 * D + 5 * H), // two on one day: newer kept
        row(10 * D), row(40 * D), row(41 * D), // past 30 days: one per week
      ];
      const pruned = versionsToPrune(rows);
      expect(pruned).toEqual(expect.arrayContaining([rows[4]._id]));
      expect(pruned).not.toContain(rows[0]._id);
      expect(pruned).not.toContain(rows[2]._id);
      expect(pruned).not.toContain(rows[3]._id);
      expect(pruned).not.toContain(rows[5]._id);
      // 40 and 41 days back: at most one of them survives when they share a week.
      expect(pruned.filter((id) => id === rows[6]._id || id === rows[7]._id).length).toBeLessThanOrEqual(1);
    });
    function versionsToPrune(rows, opts = {}) {
      return versions.versionsToPrune(rows, { now: NOW, ...opts });
    }

    test('the count and byte caps drop the oldest first, never the newest or a kept one', () => {
      const rows = Array.from({ length: 10 }, (_, i) => row(i * MIN, { size: 100, keep: i === 9 }));
      const pruned = versionsToPrune(rows, { maxCount: 4, maxBytes: 10_000 });
      expect(pruned).toEqual([3, 4, 5, 6, 7, 8].map((i) => rows[i]._id));
      const bytes = versionsToPrune(rows, { maxBytes: 250 });
      expect(bytes).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => rows[i]._id));
    });

    test('a sketch\'s history stays bounded in bytes', async () => {
      const n = await make({ type: 'handwritten', content: snapshot([stroke('a')]) });
      for (let i = 0; i < 6; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await versions.snapshotNote({ ...(await Note.findById(n._id).lean()), content: 'y'.repeat(1000) });
      }
      await versions.pruneVersions(n._id, { maxBytes: 2500 });
      expect(await count(n)).toBe(2);
      expect(MAX_VERSIONS_PER_NOTE).toBeGreaterThanOrEqual(100);
    });
  });
});
