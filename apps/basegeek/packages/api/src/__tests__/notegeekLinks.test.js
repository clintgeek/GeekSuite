/**
 * notegeekLinks.test.js
 *
 * [[Note title]] links and backlinks on the NoteGeek gateway:
 *   1. parseLinks — the syntax, aliases, code skipped, in-app id links
 *   2. resolution on save — case-insensitive, owner-scoped, pending links
 *      resolving when the note appears, renames keeping links, deletes
 *      unresolving them
 *   3. backlinks — linking notes with context, never itself, owner-scoped
 *   4. noteTitles — the [[ picker's source
 *   5. cost — a save with no links makes no link queries
 */

import { jest, describe, test, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { parseLinks, linkContext, MAX_LINKS_PER_NOTE } = await import('../graphql/notegeek/links.js');
const { listNoteVersions } = await import('../graphql/notegeek/versions.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const { Query, Mutation } = resolvers;

const create = (userId, title, content, type = 'markdown') =>
  Mutation.createNote(null, { title, content, type }, ctx(userId));
const update = (userId, note, fields) =>
  Mutation.updateNote(null, { id: String(note._id), type: 'markdown', ...fields }, ctx(userId));
const linksOf = async (note) => (await Note.findById(note._id).lean()).links
  .map((l) => ({ key: l.key, noteId: l.noteId ? String(l.noteId) : null }));

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
});

// ── 1. parseLinks ──────────────────────────────────────────────────────────
describe('parseLinks', () => {
  test('[[Title]] and [[Title|shown]], one per title, case-insensitively', () => {
    const links = parseLinks('See [[Garage Plan]] and [[garage plan|the plan]], then [[ Shed  door ]].', 'markdown');
    expect(links.map((l) => [l.key, l.title])).toEqual([
      ['garage plan', 'Garage Plan'],
      ['shed door', 'Shed door'],
    ]);
  });

  test('code is not prose: fenced blocks and inline spans are skipped', () => {
    const md = 'Real [[One]].\n\n```bash\nif [[ -f x ]]; then [[Two]]; fi\n```\n\nand `[[Three]]` inline.';
    expect(parseLinks(md, 'markdown').map((l) => l.key)).toEqual(['one']);
  });

  test('rich text: tags stripped, <pre>/<code> skipped', () => {
    const html = '<p>About <strong>[[Roof quote]]</strong></p><pre>[[Not this]]</pre><p><code>[[Nor this]]</code></p>';
    expect(parseLinks(html, 'text').map((l) => l.key)).toEqual(['roof quote']);
  });

  test('in-app id links count, already resolved', () => {
    const id = new mongoose.Types.ObjectId().toString();
    expect(parseLinks(`[Roof](/notes/${ id })`, 'markdown')).toEqual([{ key: `id:${ id }`, title: '', noteId: id }]);
    expect(parseLinks(`<p><a href="/notes/${ id }">Roof</a></p>`, 'text')[0].noteId).toBe(id);
  });

  test('only markdown and rich text; empty and huge inputs are bounded', () => {
    expect(parseLinks('[[A]]', 'code')).toEqual([]);
    expect(parseLinks('[[A]]', 'mindmap')).toEqual([]);
    expect(parseLinks('[[ ]] [[]]', 'markdown')).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => `[[N${ i }]]`).join(' ');
    expect(parseLinks(many, 'markdown')).toHaveLength(MAX_LINKS_PER_NOTE);
  });

  test('linkContext gives the words around the link', () => {
    const text = `${ 'filler '.repeat(30) }the remote is in [[Garage plan]] somewhere. ${ 'tail '.repeat(30) }`;
    const s = linkContext(text, 'markdown', ['garage plan']);
    expect(s).toContain('the remote is in [[Garage plan]] somewhere.');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
});

// ── 2. resolution ──────────────────────────────────────────────────────────
describe('resolving links on save', () => {
  test('resolves by title, case-insensitively, within the owner’s notes only', async () => {
    const target = await create(ALICE, 'Garage Plan', 'shelves');
    await create(BOB, 'Roof quote', 'bob');
    const src = await create(ALICE, 'Src', 'see [[garage plan]] and [[Roof quote]]');
    expect(await linksOf(src)).toEqual([
      { key: 'garage plan', noteId: String(target._id) },
      { key: 'roof quote', noteId: null }, // Bob's note is not Alice's link target
    ]);
  });

  test('two notes with one title: the oldest wins', async () => {
    const first = await create(ALICE, 'Dup', 'a');
    await new Promise((r) => setTimeout(r, 5));
    await create(ALICE, 'dup', 'b');
    const src = await create(ALICE, 'Src', '[[DUP]]');
    expect((await linksOf(src))[0].noteId).toBe(String(first._id));
  });

  test('an unresolved link resolves when a note with that title appears, or a note is retitled to it', async () => {
    const src = await create(ALICE, 'Src', 'todo: [[Shed door]] and [[Fence]]');
    const bobs = await create(BOB, 'Shed door', 'not alice');
    expect((await linksOf(src)).map((l) => l.noteId)).toEqual([null, null]);

    const shed = await create(ALICE, 'Shed door', 'hinges');
    expect((await linksOf(src))[0].noteId).toBe(String(shed._id));
    expect(String(shed._id)).not.toBe(String(bobs._id));

    const later = await create(ALICE, 'Untitled', 'x');
    await update(ALICE, later, { title: 'fence', content: 'x' });
    expect((await linksOf(src))[1].noteId).toBe(String(later._id));
  });

  test('renaming the target keeps the link (by id); the text is not rewritten', async () => {
    const target = await create(ALICE, 'Old title', 'body');
    const src = await create(ALICE, 'Src', 'see [[Old title]]');
    const srcUpdatedAt = (await Note.findById(src._id).lean()).updatedAt.getTime();
    await update(ALICE, target, { title: 'New title', content: 'body' });

    const after = await Note.findById(src._id).lean();
    expect(after.content).toBe('see [[Old title]]');
    expect(after.updatedAt.getTime()).toBe(srcUpdatedAt);
    expect((await linksOf(src))[0].noteId).toBe(String(target._id));

    // Re-saving the linking note with the old text keeps pointing at it.
    await update(ALICE, src, { content: 'still see [[Old title]]' });
    expect((await linksOf(src))[0].noteId).toBe(String(target._id));
    const back = await Query.backlinks(null, { noteId: String(target._id) }, ctx(ALICE));
    expect(back.map((b) => b.id)).toEqual([String(src._id)]);
  });

  test('deleting the target unresolves the link; another note with the title takes it', async () => {
    const a = await create(ALICE, 'Plan', 'a');
    const src = await create(ALICE, 'Src', '[[Plan]]');
    await Mutation.deleteNote(null, { id: String(a._id) }, ctx(ALICE));
    expect((await linksOf(src))[0].noteId).toBeNull();

    const b = await create(ALICE, 'Plan', 'b');
    expect((await linksOf(src))[0].noteId).toBe(String(b._id));

    const c = await create(ALICE, 'plan', 'c (younger)');
    await Mutation.deleteNote(null, { id: String(b._id) }, ctx(ALICE));
    expect((await linksOf(src))[0].noteId).toBe(String(c._id));
  });

  test('an id link to a deleted note disappears', async () => {
    const t = await create(ALICE, 'T', 't');
    const src = await create(ALICE, 'Src', `[T](/notes/${ t._id })`);
    expect(await linksOf(src)).toEqual([{ key: `id:${ t._id }`, noteId: String(t._id) }]);
    await Mutation.deleteNote(null, { id: String(t._id) }, ctx(ALICE));
    expect(await linksOf(src)).toEqual([]);
  });

  test('an id link to someone else’s note is dropped', async () => {
    const bobs = await create(BOB, 'Secret', 's');
    const src = await create(ALICE, 'Src', `[x](/notes/${ bobs._id })`);
    expect(await linksOf(src)).toEqual([]);
  });

  test('restoring a version re-reads its links', async () => {
    const t = await create(ALICE, 'Target', 't');
    const src = await create(ALICE, 'Src', 'no links');
    await update(ALICE, src, { content: 'now [[Target]]' });
    await update(ALICE, src, { content: 'gone again' });
    expect(await linksOf(src)).toEqual([]);
    const versions = await listNoteVersions({ noteId: String(src._id), userId: String(ALICE) });
    const withLink = versions.find((v) => v.reason === 'edit' && v.title === 'Src');
    // The newest snapshot is "now [[Target]]" (the state the last edit replaced).
    await Mutation.restoreNoteVersion(null, { versionId: String(withLink._id || withLink.id) }, ctx(ALICE));
    expect((await linksOf(src))[0]?.noteId).toBe(String(t._id));
  });

  test('Note.links is exposed as { key, title, noteId }', async () => {
    const t = await create(ALICE, 'T', 't');
    const src = await create(ALICE, 'Src', '[[T|shown]] [[Nope]]');
    const note = await Query.note(null, { id: String(src._id) }, ctx(ALICE));
    expect(resolvers.Note.links(note)).toEqual([
      { key: 't', title: 'T', noteId: String(t._id) },
      { key: 'nope', title: 'Nope', noteId: null },
    ]);
  });
});

// ── 3. backlinks ───────────────────────────────────────────────────────────
describe('backlinks', () => {
  test('linking notes, newest first, with context; never itself; owner-scoped', async () => {
    const target = await create(ALICE, 'Garage plan', 'draft');
    // Saved again once it exists, so its self-link really resolves to itself.
    await update(ALICE, target, { content: 'I link to [[Garage plan]] myself.' });
    expect((await linksOf(target))[0].noteId).toBe(String(target._id));
    const a = await create(ALICE, 'A', 'Buy brackets, see [[Garage plan]] for sizes.');
    await new Promise((r) => setTimeout(r, 5));
    const b = await create(ALICE, 'B', `<p>Also in <a href="/notes/${ target._id }">the plan</a>.</p>`, 'text');
    await create(ALICE, 'C', 'unrelated');
    await create(BOB, 'Bob', 'bob links [[Garage plan]]');

    const back = await Query.backlinks(null, { noteId: String(target._id) }, ctx(ALICE));
    expect(back.map((r) => r.id)).toEqual([String(b._id), String(a._id)]);
    expect(back[1]).toMatchObject({ title: 'A', type: 'markdown' });
    expect(back[1].snippet).toContain('see [[Garage plan]] for sizes');

    expect(await Query.backlinks(null, { noteId: String(target._id) }, ctx(BOB))).toEqual([]);
    expect(await Query.backlinks(null, { noteId: 'nope' }, ctx(ALICE))).toEqual([]);
  });
});

// ── 4. noteTitles ──────────────────────────────────────────────────────────
describe('noteTitles', () => {
  test('contains q, prefix matches first, owner-scoped, bounded', async () => {
    // "The garage" is the most recent, so only the prefix rule puts "Garage plan" first.
    await create(ALICE, 'Garage plan', 'x');
    await new Promise((r) => setTimeout(r, 5));
    await create(ALICE, 'The garage', 'x');
    await create(ALICE, 'Kitchen', 'x');
    await create(BOB, 'Garage (bob)', 'x');
    const rows = await Query.noteTitles(null, { q: 'gar' }, ctx(ALICE));
    expect(rows.map((r) => r.title)).toEqual(['Garage plan', 'The garage']);
    expect((await Query.noteTitles(null, { limit: 2 }, ctx(ALICE)))).toHaveLength(2);
    expect(await Query.noteTitles(null, { q: '.*' }, ctx(ALICE))).toEqual([]);
  });
});

// ── 5. cost ────────────────────────────────────────────────────────────────
describe('cost', () => {
  test('a save with no links makes no link lookups', async () => {
    const note = await create(ALICE, 'Plain', 'x');
    const spy = jest.spyOn(Note, 'find');
    try {
      await update(ALICE, note, { content: 'just words, no brackets' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
