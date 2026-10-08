/**
 * notegeekArchive.test.js — NoteGeek Archive (apps/notegeek/DOCS/
 * COMPOSE_MANY_AND_ARCHIVE_SPEC.md §3).
 *
 *   A1/A7 fields: a legacy note with no `archived` field is active, and the
 *         GraphQL Note resolves `archived: false` for it.
 *   A2    every read site that lists, counts or finds notes leaves an archived
 *         note out and keeps an active one in — one test per site. (The
 *         meaning-search / Related / indexer sites live in
 *         notegeekSemantic.test.js, which owns the fake embedder.)
 *   A3    note(id) still returns it; editing it does not restore it.
 *   A4    renameTag / deleteTag reach archived notes.
 *   A5    archiveNotes / restoreNotes: owner-scoped, ids ignored rather than
 *         errors, not an edit (updatedAt, no version, pinned kept), restore
 *         clears archivedAt.
 *   A6    archivedNotes: newest archivedAt first.
 */
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';

const { default: jwt } = await import('jsonwebtoken');
const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteVersion } = await import('../graphql/notegeek/models/NoteVersion.js');
const { userGeekConn } = await import('../models/user.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { suggestForNote } = await import('../graphql/notegeek/suggest.js');
const { resolvers: glanceResolvers } = await import('../graphql/glance/resolvers.js');
const { resolvers: suiteTagResolvers } = await import('../graphql/suitetags/resolvers.js');
const { default: noteGeekRoutes } = await import('../routes/noteGeek.js');

const { Query, Mutation, Note: NoteType } = resolvers;
const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});
const ids = (rows) => rows.map((r) => String(r._id ?? r.id));

const make = (overrides = {}) =>
  Note.create({ title: 'A note', content: 'body text', type: 'markdown', userId: ALICE, ...overrides });

/** One active and one archived note, alike in everything else. */
async function pair(overrides = {}) {
  const live = await make({ title: 'Live one', ...overrides });
  const gone = await make({ title: 'Gone one', ...overrides });
  await Mutation.archiveNotes(null, { ids: [String(gone._id)] }, ctx(ALICE));
  return { live, gone };
}

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
  await NoteVersion.deleteMany({});
  if (mongoose.connection.readyState === 1) await mongoose.connection.collection('notes').deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ── A1 / A7 ────────────────────────────────────────────────────────────────
describe('fields: no migration', () => {
  test('a legacy note with no archived field is active, and resolves archived: false', async () => {
    const { insertedId } = await Note.collection.insertOne({
      userId: ALICE, title: 'Legacy', content: 'old', type: 'markdown', tags: ['old'],
      createdAt: new Date(), updatedAt: new Date(),
    });
    const raw = await Note.collection.findOne({ _id: insertedId });
    expect('archived' in raw).toBe(false);

    expect(ids(await Query.notes(null, {}, ctx(ALICE)))).toEqual([String(insertedId)]);
    expect(await Query.noteTags(null, {}, ctx(ALICE))).toEqual(['old']);
    const lean = await Note.findById(insertedId).lean();
    expect(NoteType.archived(lean)).toBe(false);
    expect(NoteType.archivedAt(lean)).toBeNull();
  });

  test('archivedAt resolves to an ISO string', async () => {
    const { gone } = await pair();
    const note = await Query.note(null, { id: String(gone._id) }, ctx(ALICE));
    expect(NoteType.archived(note)).toBe(true);
    expect(NoteType.archivedAt(note)).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });
});

// ── A5 / A6 ────────────────────────────────────────────────────────────────
describe('archiveNotes / restoreNotes', () => {
  test('archiving is not an edit: updatedAt, versions, pinned and the body are untouched', async () => {
    const note = await make({ pinned: true, pinnedAt: new Date('2026-01-01') });
    await Note.collection.updateOne({ _id: note._id }, { $set: { updatedAt: new Date('2026-02-02T00:00:00Z') } });

    const out = await Mutation.archiveNotes(null, { ids: [String(note._id)] }, ctx(ALICE));
    expect(out).toEqual({ ids: [String(note._id)], count: 1 });

    const after = await Note.findById(note._id).lean();
    expect(after.archived).toBe(true);
    expect(after.archivedAt).toBeInstanceOf(Date);
    expect(after.updatedAt.toISOString()).toBe('2026-02-02T00:00:00.000Z');
    expect(after.pinned).toBe(true);
    expect(after.content).toBe('body text');
    expect(await NoteVersion.countDocuments({ noteId: note._id })).toBe(0);

    const back = await Mutation.restoreNotes(null, { ids: [String(note._id)] }, ctx(ALICE));
    expect(back).toEqual({ ids: [String(note._id)], count: 1 });
    const restored = await Note.findById(note._id).lean();
    expect(restored.archived).toBe(false);
    expect(restored.archivedAt).toBeNull();
    expect(restored.updatedAt.toISOString()).toBe('2026-02-02T00:00:00.000Z');
    expect(restored.pinned).toBe(true); // a restored pinned note is pinned again
    expect(await NoteVersion.countDocuments({ noteId: note._id })).toBe(0);
  });

  test("foreign, invalid, missing and already-archived ids are ignored, not errors", async () => {
    const mine = await make();
    const already = await make({ title: 'already' });
    await Mutation.archiveNotes(null, { ids: [String(already._id)] }, ctx(ALICE));
    const bobs = await make({ userId: BOB, title: 'bob' });

    const out = await Mutation.archiveNotes(null, {
      ids: [String(mine._id), String(bobs._id), 'not-an-id', String(new mongoose.Types.ObjectId()), String(already._id), String(mine._id)],
    }, ctx(ALICE));
    expect(out).toEqual({ ids: [String(mine._id)], count: 1 });
    expect((await Note.findById(bobs._id).lean()).archived).toBe(false);

    // Bob cannot restore Alice's note either.
    expect(await Mutation.restoreNotes(null, { ids: [String(mine._id)] }, ctx(BOB))).toEqual({ ids: [], count: 0 });
    expect((await Note.findById(mine._id).lean()).archived).toBe(true);
  });

  test('1–100 ids, and a session is required', async () => {
    await expect(Mutation.archiveNotes(null, { ids: [] }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    const many = Array.from({ length: 101 }, () => String(new mongoose.Types.ObjectId()));
    await expect(Mutation.archiveNotes(null, { ids: many }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(Mutation.archiveNotes(null, { ids: [String(new mongoose.Types.ObjectId())] }, ctx(null))).rejects.toThrow('Unauthorized');
  });

  test('archivedNotes: only the caller’s archived notes, newest archivedAt first, paged', async () => {
    const a = await make({ title: 'a' });
    const b = await make({ title: 'b' });
    await make({ title: 'active' });
    await make({ title: 'bob', userId: BOB, archived: true, archivedAt: new Date() });
    await Mutation.archiveNotes(null, { ids: [String(a._id)] }, ctx(ALICE));
    await new Promise((r) => setTimeout(r, 5));
    await Mutation.archiveNotes(null, { ids: [String(b._id)] }, ctx(ALICE));

    expect(ids(await Query.archivedNotes(null, {}, ctx(ALICE)))).toEqual([String(b._id), String(a._id)]);
    expect(ids(await Query.archivedNotes(null, { limit: 1, offset: 1 }, ctx(ALICE)))).toEqual([String(a._id)]);
    expect(await Query.archivedNotes(null, {}, ctx(null))).toEqual([]);
  });
});

// ── A3 ─────────────────────────────────────────────────────────────────────
describe('still reachable directly', () => {
  test('note(id) returns an archived note, and editing it does not restore it', async () => {
    const { gone } = await pair();
    const note = await Query.note(null, { id: String(gone._id) }, ctx(ALICE));
    expect(String(note._id)).toBe(String(gone._id));

    const edited = await Mutation.updateNote(null, { id: String(gone._id), content: 'edited body' }, ctx(ALICE));
    expect(edited.content).toBe('edited body');
    expect(edited.archived).toBe(true);
    expect(await NoteVersion.countDocuments({ noteId: gone._id })).toBe(1); // a real edit still versions
  });
});

// ── A4 ─────────────────────────────────────────────────────────────────────
describe('tag operations reach archived notes', () => {
  test('renameTag rewrites an archived note’s tag, so a restore never brings the old one back', async () => {
    const { gone } = await pair({ tags: ['house/garage'] });
    await Mutation.renameTag(null, { oldTag: 'house', newTag: 'home' }, ctx(ALICE));
    expect((await Note.findById(gone._id).lean()).tags).toEqual(['home/garage']);
  });

  test('deleteTag removes the tag from an archived note', async () => {
    const { gone } = await pair({ tags: ['house'] });
    await Mutation.deleteTag(null, { tag: 'house' }, ctx(ALICE));
    expect((await Note.findById(gone._id).lean()).tags).toEqual([]);
  });
});

// ── A2: graphql/notegeek/resolvers.js ──────────────────────────────────────
describe('A2 — notegeek resolvers', () => {
  test('notes: archived left out', async () => {
    const { live } = await pair();
    expect(ids(await Query.notes(null, {}, ctx(ALICE)))).toEqual([String(live._id)]);
  });

  test('notes with a tag / prefix / under filter: archived left out', async () => {
    const { live } = await pair({ tags: ['house/garage'] });
    expect(ids(await Query.notes(null, { tag: 'house/garage' }, ctx(ALICE)))).toEqual([String(live._id)]);
    expect(ids(await Query.notes(null, { prefix: 'house' }, ctx(ALICE)))).toEqual([String(live._id)]);
    expect(ids(await Query.notes(null, { under: 'house' }, ctx(ALICE)))).toEqual([String(live._id)]);
  });

  test('noteTags: a tag only an archived note carries is not listed', async () => {
    await make({ tags: ['kept'] });
    const gone = await make({ tags: ['kept', 'only-archived'] });
    await Mutation.archiveNotes(null, { ids: [String(gone._id)] }, ctx(ALICE));
    expect(await Query.noteTags(null, {}, ctx(ALICE))).toEqual(['kept']);
  });

  test('noteTagUsage: archived notes and their sub-tags are not counted', async () => {
    await make({ tags: ['house'] });
    const gone = await make({ tags: ['house/attic'] });
    const gone2 = await make({ tags: ['house'] });
    await Mutation.archiveNotes(null, { ids: [String(gone._id), String(gone2._id)] }, ctx(ALICE));
    expect(await Query.noteTagUsage(null, { tag: 'house' }, ctx(ALICE))).toEqual({ notes: 1, subTags: 0 });
  });

  test('searchNotes (keyword): archived left out', async () => {
    const { live } = await pair({ content: 'zanzibar ferry timetable' });
    const rows = await Query.searchNotes(null, { q: 'zanzibar' }, ctx(ALICE));
    expect(ids(rows)).toEqual([String(live._id)]);
  });

  test('noteTitles ([[ picker): archived left out, with and without a query', async () => {
    const { live } = await pair();
    expect((await Query.noteTitles(null, { q: 'one' }, ctx(ALICE))).map((r) => r.id)).toEqual([String(live._id)]);
    expect((await Query.noteTitles(null, {}, ctx(ALICE))).map((r) => r.id)).toEqual([String(live._id)]);
  });
});

// ── A2: links.js ───────────────────────────────────────────────────────────
describe('A2 — links', () => {
  const create = (title, content) =>
    Mutation.createNote(null, { title, content, type: 'markdown' }, ctx(ALICE));

  test('backlinks list no archived source', async () => {
    const target = await create('Target', 'the target');
    const liveSrc = await create('Live source', 'see [[Target]] here');
    const goneSrc = await create('Gone source', 'also [[Target]]');
    await Mutation.archiveNotes(null, { ids: [String(goneSrc._id)] }, ctx(ALICE));
    const back = await Query.backlinks(null, { noteId: String(target._id) }, ctx(ALICE));
    expect(back.map((b) => b.id)).toEqual([String(liveSrc._id)]);
  });

  test('a link TO an archived note still resolves', async () => {
    const target = await create('Old plan', 'archived soon');
    await Mutation.archiveNotes(null, { ids: [String(target._id)] }, ctx(ALICE));
    const src = await create('Source', 'see [[Old plan]]');
    expect(String(src.links[0].noteId)).toBe(String(target._id));
  });

  test('when an archived and an active note share a title, the active one wins', async () => {
    // The archived note is OLDER, so the old rule (oldest first) would pick it.
    const old = await create('Shared', 'v1');
    await Mutation.archiveNotes(null, { ids: [String(old._id)] }, ctx(ALICE));
    const fresh = await create('Shared', 'v2');
    const src = await create('Source', 'see [[Shared]]');
    expect(String(src.links[0].noteId)).toBe(String(fresh._id));
  });

  test('a link kept on an archived target gives way to an active note with the title', async () => {
    const old = await create('Recipe', 'v1');
    const src = await create('Source', 'see [[Recipe]]');
    expect(String(src.links[0].noteId)).toBe(String(old._id));
    await Mutation.archiveNotes(null, { ids: [String(old._id)] }, ctx(ALICE));
    const fresh = await create('Recipe', 'v2');
    const saved = await Mutation.updateNote(null, { id: String(src._id), content: 'see [[Recipe]] again' }, ctx(ALICE));
    expect(String(saved.links[0].noteId)).toBe(String(fresh._id));
  });
});

// ── A2: suggest.js ─────────────────────────────────────────────────────────
describe('A2 — suggest', () => {
  test('an archived note is never suggested, nor evidence for a tag', async () => {
    await make({ title: 'nginx layout', tags: ['homelab'] });
    const gone = await make({ title: 'nginx archived', tags: ['retired-tag'] });
    await Mutation.archiveNotes(null, { ids: [String(gone._id)] }, ctx(ALICE));
    const out = await suggestForNote({ userId: String(ALICE), title: 'nginx proxy', excerpt: '', tags: [] });
    expect(out.related.map((r) => r.title)).toEqual(['nginx layout']);
    expect(out.tags.map((t) => t.tag)).not.toContain('retired-tag');
  });
});

// ── A2: glance (StartGeek) ─────────────────────────────────────────────────
describe('A2 — glance', () => {
  test('glanceToday recentNotes: archived left out', async () => {
    await pair();
    const today = await glanceResolvers.Query.glanceToday(null, { date: '2026-01-15' }, ctx(ALICE));
    expect(today.recentNotes.map((n) => n.title)).toEqual(['Live one']);
  });

  test('glanceSearch: archived left out', async () => {
    await pair({ content: 'quokka sighting' });
    const results = await glanceResolvers.Query.glanceSearch(null, { query: 'quokka' }, ctx(ALICE));
    expect(results.filter((r) => r.app === 'notegeek').map((r) => r.title)).toEqual(['Live one']);
  });
});

// ── A2: suitetags ──────────────────────────────────────────────────────────
describe('A2 — suiteTags', () => {
  test('suiteTags: archived notes are not counted', async () => {
    await pair({ tags: ['shared-tag'] });
    const tags = await suiteTagResolvers.Query.suiteTags(null, {}, ctx(ALICE));
    const row = tags.find((t) => t.tag === 'shared-tag');
    expect(row.apps.find((a) => a.app === 'notegeek').count).toBe(1);
  });

  test('taggedAcross: archived notes are not listed', async () => {
    await pair({ tags: ['shared-tag'] });
    const rows = await suiteTagResolvers.Query.taggedAcross(null, { tag: 'shared-tag', apps: ['notegeek'] }, ctx(ALICE));
    expect(rows.map((r) => r.title)).toEqual(['Live one']);
  });
});

// ── A2: legacy REST /api/notes ─────────────────────────────────────────────
describe('A2 — legacy REST /api/notes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/notes', noteGeekRoutes);
  const token = () => jwt.sign({ id: String(ALICE), app: 'notegeek' }, process.env.JWT_SECRET);

  async function seedRest() {
    // The legacy router has its own model on the default connection.
    const col = mongoose.connection.collection('notes');
    await col.insertMany([
      { userId: ALICE, title: 'Live one', content: 'x', tags: ['rest/live'], type: 'markdown', updatedAt: new Date() },
      { userId: ALICE, title: 'Legacy', content: 'x', tags: ['rest/legacy'], type: 'markdown', updatedAt: new Date() },
      { userId: ALICE, title: 'Gone one', content: 'x', tags: ['rest/gone'], type: 'markdown', archived: true, archivedAt: new Date(), updatedAt: new Date() },
    ]);
  }

  test('GET / lists no archived note (and keeps the legacy one)', async () => {
    await seedRest();
    const res = await request(app).get('/api/notes').set('Authorization', `Bearer ${ token() }`);
    expect(res.status).toBe(200);
    expect(res.body.map((n) => n.title).sort()).toEqual(['Legacy', 'Live one']);
  });

  test('GET /tags builds no hierarchy from an archived note', async () => {
    await seedRest();
    const res = await request(app).get('/api/notes/tags').set('Authorization', `Bearer ${ token() }`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('live');
    expect(JSON.stringify(res.body)).not.toContain('gone');
  });
});
