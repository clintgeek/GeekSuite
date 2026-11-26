/**
 * NoteGeek lists and word search (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md Tier 5,
 * gateway half):
 *   5.1  `preview` per type; lists don't read `content` unless it is selected
 *   5.2  notesPage: keyset pages, server-side sorts
 *   5.3  word search indexes words, not markup
 *   5.4  title > tags > body weights; a title-prefix list ("gar" → Garage door)
 *   5.5  snippets around the hit, at word starts; sketches show their transcript
 *   5.10 a long query is cut, not refused
 *   glance / suite-tags show `preview`, never a sketch's JSON
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { parse } from 'graphql';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { userGeekConn } = await import('../models/user.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { resolvers: glanceResolvers } = await import('../graphql/glance/resolvers.js');
const { resolvers: suiteTagResolvers } = await import('../graphql/suitetags/resolvers.js');
const { previewFor, snippetAround, wordTextFor } = await import('../graphql/notegeek/noteDerived.js');
const { ensureNoteWordIndex } = await import('../graphql/notegeek/wordIndex.js');
const { markServiceDown, _resetSemanticState } = await import('../graphql/notegeek/semantic.js');

const { Query, Mutation } = resolvers;
const ALICE = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const create = (args) => Mutation.createNote(null, { type: 'markdown', ...args }, ctx(ALICE));
/** A note of a type the gateway no longer writes (still stored, until purged). */
const legacy = (args) => Note.create({ userId: ALICE, ...args });

/** The `info` a resolver gets for this operation's root field. */
function infoFor(source) {
  const doc = parse(source);
  const op = doc.definitions.find((d) => d.kind === 'OperationDefinition');
  const fragments = Object.fromEntries(doc.definitions.filter((d) => d.kind === 'FragmentDefinition').map((f) => [f.name.value, f]));
  return { fieldNodes: [op.selectionSet.selections[0]], fragments };
}

function snapshot(n = 1) {
  const store = {};
  for (let i = 0; i < n; i += 1) store[`shape:${ i }`] = { id: `shape:${ i }`, typeName: 'shape', type: 'draw', props: { segments: [{ points: [{ x: i, y: 1 }] }] } };
  return JSON.stringify({ store });
}

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  await ensureNoteWordIndex();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
  _resetSemanticState();
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
});

// ── 5.1 / 5.3 ──────────────────────────────────────────────────────────────
describe('preview and word text are words, not markup', () => {
  test('each type', () => {
    expect(previewFor({ type: 'markdown', content: '# Title\n\n**Bold** and [a link](http://x.example/y)\n- item' })).toBe('Title — Bold and a link item');
    expect(previewFor({ type: 'markdown', title: 'x', content: '# Only a heading' })).toBe('Only a heading');
    expect(previewFor({ type: 'markdown', title: 'x', content: '# A\n## B\ntext' })).toBe('A — B — text');
    expect(previewFor({ type: 'text', content: '<p>Hello <a href="x" target="_blank">there</a></p>' })).toBe('Hello there');
    expect(previewFor({ type: 'code', content: JSON.stringify({ language: 'js', code: 'const x = 1;' }) })).toBe('const x = 1;');
    expect(previewFor({ type: 'mindmap', content: JSON.stringify({ nodes: [{ data: { label: 'Root' } }, { data: { label: 'Leaf' } }] }) })).toBe('Root Leaf');
    expect(previewFor({ type: 'handwritten', content: snapshot(), sketchTranscript: { text: 'buy milk' } })).toBe('buy milk');
    expect(previewFor({ type: 'markdown', content: 'secret', isLocked: true })).toBe('');
    // A leading heading that repeats the title is left out; other headings stay.
    expect(previewFor({ type: 'markdown', title: 'Cookies', content: '# Cookies\n\nBrown the butter' })).toBe('Brown the butter');
    expect(previewFor({ type: 'markdown', title: '  cookies ', content: '\n\n##  COOKIES  ##\nBrown   the butter' })).toBe('Brown the butter');
    expect(previewFor({ type: 'markdown', title: 'Recipes', content: '# Cookies\n\nBrown the butter' })).toBe('Cookies — Brown the butter');
    expect(previewFor({ type: 'markdown', title: 'Cookies', content: 'Intro\n# Cookies\nBrown' })).toBe('Intro Cookies — Brown');
    expect(previewFor({ type: 'markdown', content: '# Cookies\n\nBrown' })).toBe('Cookies — Brown');
    expect(wordTextFor({ type: 'markdown', title: 'Cookies', content: '# Cookies\n\nBrown' })).toBe('Cookies\n\nBrown');
    expect(wordTextFor({ type: 'markdown', content: 'x', isEncrypted: true })).toBe('');
    expect(previewFor({ type: 'markdown', content: 'word '.repeat(100) }).length).toBeLessThanOrEqual(201);
  });

  test('a list that does not select content never reads it, and gets preview', async () => {
    await create({ title: 'Sketch', type: 'handwritten', content: snapshot(50) });
    const md = await create({ title: 'Md', content: '## Groceries\n\n- eggs' });
    const info = infoFor('query { notes { id title preview } }');
    const rows = await Query.notes(null, {}, ctx(ALICE), info);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect('content' in r).toBe(false);
    expect(resolvers.Note.preview(rows.find((r) => String(r._id) === String(md._id)))).toBe('Groceries — eggs');
    // Selected (also through a fragment): read.
    const withBody = await Query.notes(null, {}, ctx(ALICE), infoFor('query { notes { ...F } } fragment F on Note { id content }'));
    expect(withBody.every((r) => typeof r.content === 'string')).toBe(true);
  });

  test('updateNote answers without the body when the body is not selected', async () => {
    const n = await create({ title: 'S', type: 'handwritten', content: snapshot(5) });
    const out = await Mutation.updateNote(null, { id: String(n._id), content: snapshot(6), type: 'handwritten' }, ctx(ALICE), infoFor('mutation { updateNote(id: "x") { id updatedAt } }'));
    expect('content' in out).toBe(false);
    expect(out.updatedAt).toBeInstanceOf(Date);
  });

  test('a lean row from before `preview` still resolves its defaults', async () => {
    const { insertedId } = await Note.collection.insertOne({ userId: ALICE, title: 'Legacy', content: 'old words here', createdAt: new Date(), updatedAt: new Date() });
    const [row] = await Query.notes(null, {}, ctx(ALICE), infoFor('query { notes { id preview pinned type } }'));
    expect(String(row._id)).toBe(String(insertedId));
    expect(resolvers.Note.preview(row)).toBe('old words here');
    expect(resolvers.Note.pinned(row)).toBe(false);
    expect(resolvers.Note.type(row)).toBe('markdown');
  });
});

// ── 5.2 ────────────────────────────────────────────────────────────────────
describe('notesPage', () => {
  async function seed() {
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const n = await create({ content: 'x', title: ['delta', 'Alpha', 'charlie', 'Bravo', 'echo', 'foxtrot', 'golf'][i] });
      // eslint-disable-next-line no-await-in-loop
      await Note.collection.updateOne({ _id: n._id }, { $set: { updatedAt: new Date(Date.UTC(2026, 10, 1, 12, i)), pinned: i === 2 } });
      out.push(n);
    }
    return out;
  }
  async function all(args) {
    const titles = [];
    let after = null;
    for (let guard = 0; guard < 10; guard += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await Query.notesPage(null, { first: 3, ...args, after }, ctx(ALICE));
      titles.push(...page.notes.map((n) => n.title));
      if (!page.hasMore) { expect(page.nextCursor).toBeNull(); break; }
      after = page.nextCursor;
    }
    return titles;
  }

  test('pages cover the list exactly once, pinned first, newest edit next', async () => {
    await seed();
    expect(await all({})).toEqual(['charlie', 'golf', 'foxtrot', 'echo', 'Bravo', 'Alpha', 'delta']);
    expect(await all({ sort: 'updatedAt_asc' })).toEqual(['charlie', 'delta', 'Alpha', 'Bravo', 'echo', 'foxtrot', 'golf']);
  });

  test('A–Z ignores case', async () => {
    await seed();
    expect(await all({ sort: 'title_asc' })).toEqual(['charlie', 'Alpha', 'Bravo', 'delta', 'echo', 'foxtrot', 'golf']);
    expect((await Query.notes(null, { sort: 'title_asc' }, ctx(ALICE))).map((n) => n.title)).toEqual(['charlie', 'Alpha', 'Bravo', 'delta', 'echo', 'foxtrot', 'golf']);
  });

  test('a note edited while paging moves to the top, but nothing repeats or is skipped', async () => {
    const notes = await seed();
    const first = await Query.notesPage(null, { first: 3 }, ctx(ALICE));
    expect(first.notes.map((n) => n.title)).toEqual(['charlie', 'golf', 'foxtrot']);
    await Note.collection.updateOne({ _id: notes[0]._id }, { $set: { updatedAt: new Date(Date.UTC(2026, 10, 2)) } }); // delta edited
    const second = await Query.notesPage(null, { first: 10, after: first.nextCursor }, ctx(ALICE));
    expect(second.notes.map((n) => n.title)).toEqual(['echo', 'Bravo', 'Alpha']);
  });

  test('more than 200 notes are reachable', async () => {
    await Note.insertMany(Array.from({ length: 230 }, (_, i) => ({ userId: ALICE, title: `n${ i }`, content: 'x', type: 'markdown' })));
    const seen = new Set();
    let after = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await Query.notesPage(null, { first: 200, after }, ctx(ALICE));
      page.notes.forEach((n) => seen.add(String(n._id)));
      if (!page.hasMore) break;
      after = page.nextCursor;
    }
    expect(seen.size).toBe(230);
  });

  test('notUnder leaves out whole tag subtrees, across pages and with other filters', async () => {
    await create({ title: 'plain', content: 'x' });
    await create({ title: 'tagged', content: 'x', tags: ['house'] });
    await create({ title: 'day', content: 'x', tags: ['daily', 'daily/2026-11-24'] });
    await create({ title: 'meet', content: 'x', tags: ['meeting'] });
    await create({ title: 'alex', content: 'x', tags: ['fd/1on1/alex'] });
    await create({ title: 'both', content: 'x', tags: ['house', 'meeting'] });
    await create({ title: 'dailyish', content: 'x', tags: ['dailyplanet'] });
    const notUnder = ['daily', 'meeting', 'fd/1on1'];
    expect((await all({ notUnder, sort: 'title_asc' }))).toEqual(['dailyish', 'plain', 'tagged']);
    expect((await all({ notUnder, under: 'house' }))).toEqual(['tagged']);
    expect((await Query.notes(null, { notUnder, sort: 'title_asc' }, ctx(ALICE))).map((n) => n.title)).toEqual(['dailyish', 'plain', 'tagged']);
    // Nothing to leave out narrows nothing.
    expect(await all({ notUnder: [], sort: 'title_asc' })).toHaveLength(7);
    expect(await all({ notUnder: ['nowhere'], sort: 'title_asc' })).toHaveLength(7);
  });

  test('a bad cursor starts over; a bad sort is refused', async () => {
    await seed();
    expect((await Query.notesPage(null, { first: 2, after: 'garbage' }, ctx(ALICE))).notes).toHaveLength(2);
    await expect(Query.notesPage(null, { sort: 'size' }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

// ── 5.3–5.5, 5.10 ──────────────────────────────────────────────────────────
describe('word search', () => {
  const ids = (rows) => rows.map((r) => String(r._id));

  test('markup is not words: "target", "language" and "label" match no note', async () => {
    await legacy({ title: 'Rich', type: 'text', content: '<p><a href="https://x.example" target="_blank">link</a></p>' });
    await legacy({ title: 'Code', type: 'code', content: JSON.stringify({ language: 'python', code: 'print(1)' }) });
    await legacy({ title: 'Map', type: 'mindmap', content: JSON.stringify({ nodes: [{ id: '1', data: { label: 'Root idea' } }] }) });
    for (const q of ['target', 'language', 'label', 'blank']) {
      // eslint-disable-next-line no-await-in-loop
      expect(await Query.searchNotes(null, { q }, ctx(ALICE))).toEqual([]);
    }
    expect((await Query.searchNotes(null, { q: 'print' }, ctx(ALICE))).map((r) => r.title)).toEqual(['Code']);
    expect((await Query.searchNotes(null, { q: 'idea' }, ctx(ALICE))).map((r) => r.title)).toEqual(['Map']);
  });

  test('a title hit outranks a body that repeats the word', async () => {
    const body = await create({ title: 'Weekend', content: 'garden garden garden garden notes about the garden' });
    const title = await create({ title: 'Garden', content: 'tomatoes' });
    expect(ids(await Query.searchNotes(null, { q: 'garden' }, ctx(ALICE)))).toEqual([String(title._id), String(body._id)]);
  });

  test('"gar" finds Garage door by its title (hybrid), even with meaning search down', async () => {
    markServiceDown(new Error('down'));
    const g = await create({ title: 'Garage door', content: 'chamberlain' });
    await create({ title: 'Cigar box', content: 'x' });
    const rows = await Query.searchNotes(null, { q: 'gar', hybrid: true }, ctx(ALICE));
    expect(ids(rows)).toEqual([String(g._id)]);
    expect(rows[0].matchedBy).toBe('keyword');
  });

  test('snippets: around the hit, at the start of a word, plain text', async () => {
    const long = `${ 'filler words here. '.repeat(30) }On Sunday we rested. The day off was spent fixing the fence.`;
    await create({ title: 'Diary', content: long });
    const [row] = await Query.searchNotes(null, { q: 'fence' }, ctx(ALICE));
    expect(row.snippet).toMatch(/^…/);
    expect(row.snippet).toContain('fixing the fence');
    // "day" begins "day off", not the end of "Sunday".
    const at = snippetAround(long, 'day');
    expect(at.indexOf('day off')).toBeGreaterThan(-1);
    expect(at.startsWith('…')).toBe(true);
    expect(snippetAround('Sunday only', 'day')).toBe('Sunday only');
  });

  test('a sketch is found by its transcript and shows it, never its JSON', async () => {
    const s = await create({ title: 'Sketch', type: 'handwritten', content: snapshot(3) });
    await Mutation.saveSketchTranscriptEdit(null, { noteId: String(s._id), text: 'call the plumber tomorrow' }, ctx(ALICE));
    const [row] = await Query.searchNotes(null, { q: 'plumber', hybrid: true }, ctx(ALICE));
    expect(String(row._id)).toBe(String(s._id));
    expect(row.snippet).toBe('call the plumber tomorrow');
    expect(await Query.searchNotes(null, { q: 'shape' }, ctx(ALICE))).toEqual([]);
  });

  test('a 12 000-character query is cut (at a word) to 500, not refused', async () => {
    await create({ title: 'Fence', content: 'posts' });
    const q = `fence ${ 'word '.repeat(2400) }`;
    const searched = [];
    const realFind = Note.find.bind(Note);
    jest.spyOn(Note, 'find').mockImplementation((filter, ...rest) => {
      if (filter?.$text) searched.push(filter.$text.$search);
      return realFind(filter, ...rest);
    });
    const rows = await Query.searchNotes(null, { q, hybrid: true }, ctx(ALICE));
    jest.restoreAllMocks();
    expect(rows.map((r) => r.title)).toEqual(['Fence']);
    expect(searched).toHaveLength(1);
    expect(searched[0].length).toBeLessThanOrEqual(500);
    expect(searched[0].endsWith('word')).toBe(true);
  });
});

// ── glance / suite-tags ────────────────────────────────────────────────────
describe('glance and suite-tags show the preview', () => {
  test('a sketch shows its transcript, never tldraw JSON', async () => {
    const s = await create({ title: 'Board', type: 'handwritten', content: snapshot(4), tags: ['plans'] });
    await Mutation.saveSketchTranscriptEdit(null, { noteId: String(s._id), text: 'sprint goals' }, ctx(ALICE));
    const today = await glanceResolvers.Query.glanceToday(null, {}, ctx(ALICE));
    expect(today.recentNotes[0].snippet).toBe('sprint goals');
    const rows = await suiteTagResolvers.Query.taggedAcross(null, { tag: 'plans', apps: ['notegeek'] }, ctx(ALICE));
    expect(rows[0].snippet).toBe('sprint goals');
    for (const snip of [today.recentNotes[0].snippet, rows[0].snippet]) expect(snip).not.toMatch(/[{"]store|typeName/);
  });
});
