/**
 * notegeekNestedTags.test.js
 *
 * Bear-style nested tags on the NoteGeek gateway. A tag is a `/` path;
 * `house/garage` is its own tag and sits under `house`.
 *   1. normalizeTag / normalizeTags — the one spelling every write stores.
 *   2. notes(under:) — the tag and everything beneath it, never `houseboat`.
 *   3. renameTag — the whole subtree moves, merges without duplicates,
 *      refuses a move into its own descendant, stays inside the owner's notes.
 *   4. deleteTag — the subtree goes; the notes stay.
 *   5. noteTagUsage — the numbers the delete dialog shows.
 */

import mongoose from 'mongoose';
import { normalizeTag, normalizeTags } from '../graphql/notegeek/tags.js';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});
const { Query, Mutation } = resolvers;

const makeNote = (tags, overrides = {}) =>
  Note.create({ title: tags.join(' '), content: 'body', userId: ALICE, tags, ...overrides });
const tagsOf = async (note) => (await Note.findById(note._id)).tags;
const titles = (notes) => notes.map((n) => n.title).sort();

beforeAll(async () => {
  await Note.db.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await Note.init();
}, 60000);

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('normalizeTag / normalizeTags', () => {
  test.each([
    [' house // garage/ ', 'house/garage'],
    ['house / garage', 'house/garage'],
    ['/house/', 'house'],
    ['House/Garage', 'house/garage'],
    ['  work  ', 'work'],
    ['/', ''],
    [' // ', ''],
    ['', ''],
    [null, ''],
    ['a b/c d', 'a-b/c-d'],
    ['work/GeekSuite', 'work/geek-suite'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });

  test('normalizeTags drops empties and dedupes in order — case folds to one tag', () => {
    expect(normalizeTags(['b', ' a ', 'house / garage', '', '/', 'b', 'house/garage', 'B']))
      .toEqual(['b', 'a', 'house/garage']);
  });

  test('createNote and updateNote store normalized, deduped tags', async () => {
    const created = await Mutation.createNote(
      null,
      { content: 'x', tags: [' house // garage/ ', 'house/garage', '/', 'Work', 'GeekSuite', 'geek_suite'] },
      ctx(ALICE),
    );
    expect([...created.tags]).toEqual(['house/garage', 'work', 'geek-suite']);

    const updated = await Mutation.updateNote(
      null,
      { id: String(created._id), tags: ['a / b', 'a/b', ' c '] },
      ctx(ALICE),
    );
    expect([...updated.tags]).toEqual(['a/b', 'c']);
  });
});

describe('notes(under:)', () => {
  beforeEach(async () => {
    await makeNote(['house']);
    await makeNote(['house/garage']);
    await makeNote(['house/garage/door', 'misc']);
    await makeNote(['houseboat']);
    await makeNote(['garden']);
    await makeNote(['house'], { userId: BOB, title: 'bob house' });
  });

  test('returns the tag and everything beneath it — not houseboat, not Bob', async () => {
    const notes = await Query.notes(null, { under: 'house' }, ctx(ALICE));
    expect(titles(notes)).toEqual(['house', 'house/garage', 'house/garage/door misc']);
  });

  test('a child view is scoped to the child', async () => {
    const notes = await Query.notes(null, { under: 'house/garage' }, ctx(ALICE));
    expect(titles(notes)).toEqual(['house/garage', 'house/garage/door misc']);
  });

  test('under is normalized like a stored tag', async () => {
    const notes = await Query.notes(null, { under: ' house / garage/ ' }, ctx(ALICE));
    expect(titles(notes)).toEqual(['house/garage', 'house/garage/door misc']);
  });

  test('regex characters in the tag are literal', async () => {
    await makeNote(['c++']);
    await makeNote(['cxx']);
    expect(titles(await Query.notes(null, { under: 'c++' }, ctx(ALICE)))).toEqual(['c++']);
    expect(titles(await Query.notes(null, { under: 'h.use' }, ctx(ALICE)))).toEqual([]);
  });

  test('tag stays exact and prefix stays a raw prefix (old bundles)', async () => {
    expect(titles(await Query.notes(null, { tag: 'house' }, ctx(ALICE)))).toEqual(['house']);
    expect(titles(await Query.notes(null, { prefix: 'house' }, ctx(ALICE)))).toEqual([
      'house', 'house/garage', 'house/garage/door misc', 'houseboat',
    ]);
  });

  test('under narrows together with tag', async () => {
    const notes = await Query.notes(null, { under: 'house', tag: 'misc' }, ctx(ALICE));
    expect(titles(notes)).toEqual(['house/garage/door misc']);
  });

  test('searchNotes accepts under too', async () => {
    await Note.init();
    await makeNote(['house/garage'], { title: 'zebra one', content: 'zebra' });
    await makeNote(['houseboat'], { title: 'zebra two', content: 'zebra' });
    const hits = await Query.searchNotes(null, { q: 'zebra', under: 'house' }, ctx(ALICE));
    expect(hits.map((h) => h.title)).toEqual(['zebra one']);
  });
});

describe('renameTag — the subtree moves', () => {
  test('house → home carries every child and leaves houseboat alone', async () => {
    const a = await makeNote(['house', 'x']);
    const b = await makeNote(['x', 'house/garage']);
    const c = await makeNote(['house/garage/door']);
    const d = await makeNote(['houseboat']);

    expect(await Mutation.renameTag(null, { oldTag: 'house', newTag: 'home' }, ctx(ALICE))).toBe(true);

    expect(await tagsOf(a)).toEqual(['home', 'x']);
    expect(await tagsOf(b)).toEqual(['x', 'home/garage']);
    expect(await tagsOf(c)).toEqual(['home/garage/door']);
    expect(await tagsOf(d)).toEqual(['houseboat']);
  });

  test('moving = renaming to a path; children follow', async () => {
    const a = await makeNote(['garage']);
    const b = await makeNote(['garage/door']);

    await Mutation.renameTag(null, { oldTag: 'garage', newTag: 'house/garage' }, ctx(ALICE));

    expect(await tagsOf(a)).toEqual(['house/garage']);
    expect(await tagsOf(b)).toEqual(['house/garage/door']);
  });

  test('merging into an existing tag leaves one copy, at the first position', async () => {
    const a = await makeNote(['home', 'house', 'house/garage', 'home/garage']);

    await Mutation.renameTag(null, { oldTag: 'house', newTag: 'home' }, ctx(ALICE));

    expect(await tagsOf(a)).toEqual(['home', 'home/garage']);
  });

  test('moving a child up onto its parent merges into the parent', async () => {
    const a = await makeNote(['house', 'house/garage', 'house/garage/door']);

    await Mutation.renameTag(null, { oldTag: 'house/garage', newTag: 'house' }, ctx(ALICE));

    expect(await tagsOf(a)).toEqual(['house', 'house/door']);
  });

  test('refuses to move a tag into its own descendant', async () => {
    const a = await makeNote(['house', 'house/garage']);

    await expect(
      Mutation.renameTag(null, { oldTag: 'house', newTag: 'house/garage' }, ctx(ALICE)),
    ).rejects.toMatchObject({
      message: expect.stringContaining('inside itself'),
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
    expect(await tagsOf(a)).toEqual(['house', 'house/garage']);
  });

  test('a sibling with a shared prefix is not a descendant', async () => {
    const a = await makeNote(['house']);
    await Mutation.renameTag(null, { oldTag: 'house', newTag: 'houseboat' }, ctx(ALICE));
    expect(await tagsOf(a)).toEqual(['houseboat']);
  });

  test('inputs are normalized, and a normalized no-op is still a no-op', async () => {
    const a = await makeNote(['house/garage']);
    expect(
      await Mutation.renameTag(null, { oldTag: 'house / garage', newTag: 'house/garage/' }, ctx(ALICE)),
    ).toBe(false);
    expect(await tagsOf(a)).toEqual(['house/garage']);

    await Mutation.renameTag(null, { oldTag: ' house / garage ', newTag: 'shed' }, ctx(ALICE));
    expect(await tagsOf(a)).toEqual(['shed']);
  });

  test('another user’s subtree is untouched', async () => {
    const mine = await makeNote(['house/garage']);
    const bobs = await makeNote(['house', 'house/garage'], { userId: BOB });

    await Mutation.renameTag(null, { oldTag: 'house', newTag: 'home' }, ctx(ALICE));

    expect(await tagsOf(mine)).toEqual(['home/garage']);
    expect(await tagsOf(bobs)).toEqual(['house', 'house/garage']);
  });

  test('non-ASCII names survive; a legacy $-leading tag is literal, not an expression', async () => {
    const a = await makeNote(['café', 'café/crème']);
    await Mutation.renameTag(null, { oldTag: 'café', newTag: 'prix' }, ctx(ALICE));
    expect(await tagsOf(a)).toEqual(['prix', 'prix/crème']);
    // `$price` can no longer be written (the standard drops `$`), but one
    // stored before it is still matched — and rewritten — as a plain string.
    const b = await makeNote(['$price', '$price/Crème']);
    expect(await Mutation.renameTag(null, { oldTag: 'price', newTag: 'cost' }, ctx(ALICE))).toBe(true);
    expect(await tagsOf(b)).toEqual(['cost', 'cost/crème']);
  });

  test('a case-only rename is a no-op (case folds under the standard)', async () => {
    const a = await makeNote(['work']);
    expect(await Mutation.renameTag(null, { oldTag: 'work', newTag: 'Work' }, ctx(ALICE))).toBe(false);
    expect(await tagsOf(a)).toEqual(['work']);
  });

  test('refuses a rename whose children would exceed the tag length', async () => {
    const a = await makeNote(['a', `a/${ 'c'.repeat(60) }`]);
    await expect(
      Mutation.renameTag(null, { oldTag: 'a', newTag: 'b'.repeat(60) }, ctx(ALICE)),
    ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    expect(await tagsOf(a)).toEqual(['a', `a/${ 'c'.repeat(60) }`]);
  });
});

describe('deleteTag — the subtree goes, the notes stay', () => {
  test('removes the tag and its sub-tags, keeps houseboat, keeps the notes', async () => {
    const a = await makeNote(['house', 'x']);
    const b = await makeNote(['house/garage/door']);
    const c = await makeNote(['houseboat']);
    const bobs = await makeNote(['house/garage'], { userId: BOB });

    expect(await Mutation.deleteTag(null, { tag: 'house' }, ctx(ALICE))).toBe(true);

    expect(await tagsOf(a)).toEqual(['x']);
    expect(await tagsOf(b)).toEqual([]);
    expect(await tagsOf(c)).toEqual(['houseboat']);
    expect(await tagsOf(bobs)).toEqual(['house/garage']);
    expect(await Note.countDocuments({ userId: ALICE })).toBe(3);
  });

  test('deleting a child leaves the parent', async () => {
    const a = await makeNote(['house', 'house/garage', 'house/garage/door', 'house/kitchen']);
    await Mutation.deleteTag(null, { tag: 'house/garage' }, ctx(ALICE));
    expect(await tagsOf(a)).toEqual(['house', 'house/kitchen']);
  });
});

describe('noteTagUsage', () => {
  test('counts notes in the subtree and distinct sub-tags', async () => {
    await makeNote(['house']);
    await makeNote(['house/garage', 'x']);
    await makeNote(['house/garage/door', 'house/kitchen']);
    await makeNote(['houseboat']);
    await makeNote(['house/attic'], { userId: BOB });

    expect(await Query.noteTagUsage(null, { tag: 'house' }, ctx(ALICE))).toEqual({ notes: 3, subTags: 3, archived: 0 });
    expect(await Query.noteTagUsage(null, { tag: 'house/garage' }, ctx(ALICE))).toEqual({ notes: 2, subTags: 1, archived: 0 });
    expect(await Query.noteTagUsage(null, { tag: 'ghost' }, ctx(ALICE))).toEqual({ notes: 0, subTags: 0, archived: 0 });
    expect(await Query.noteTagUsage(null, { tag: 'house' }, ctx(null))).toEqual({ notes: 0, subTags: 0, archived: 0 });
  });
});

// Tags stored before the suite standard (2026-10-01) stay in the database
// until scripts/migrate-tags-kebab.js --apply rewrites them. Every read and
// every rename/delete must still find them by their standard spelling.
describe('legacy (pre-standard) tags are tolerated until the migration', () => {
  beforeEach(async () => {
    await makeNote(['GeekSuite', 'Work'], { title: 'legacy camel' });
    await makeNote(['geekSuite/Roadmap'], { title: 'legacy child' });
    await makeNote(['geek-suite'], { title: 'standard' });
    await makeNote(['geekSuiteboat'], { title: 'not a child' });
    await makeNote(['GeekSuite'], { userId: BOB, title: 'bob legacy' });
  });

  test('notes(tag:) and notes(under:) match legacy spellings by their standard form', async () => {
    expect(titles(await Query.notes(null, { tag: 'geek-suite' }, ctx(ALICE)))).toEqual(['legacy camel', 'standard']);
    expect(titles(await Query.notes(null, { tag: 'GeekSuite' }, ctx(ALICE)))).toEqual(['legacy camel', 'standard']);
    expect(titles(await Query.notes(null, { under: 'geek-suite' }, ctx(ALICE))))
      .toEqual(['legacy camel', 'legacy child', 'standard']);
  });

  test('Note.tags and noteTags read in the standard spelling', async () => {
    const [note] = await Query.notes(null, { tag: 'work' }, ctx(ALICE));
    expect(resolvers.Note.tags(note)).toEqual(['geek-suite', 'work']);
    expect(await Query.noteTags(null, {}, ctx(ALICE)))
      .toEqual(['geek-suite', 'geek-suite/roadmap', 'geek-suiteboat', 'work']);
  });

  test('noteTagUsage counts legacy spellings, sub-tags once each', async () => {
    expect(await Query.noteTagUsage(null, { tag: 'geek-suite' }, ctx(ALICE))).toEqual({ notes: 3, subTags: 1, archived: 0 });
  });

  test('renameTag rewrites legacy spellings onto the standard path', async () => {
    expect(await Mutation.renameTag(null, { oldTag: 'geek-suite', newTag: 'work/suite' }, ctx(ALICE))).toBe(true);
    const byTitle = async (title) => (await Note.findOne({ userId: ALICE, title })).tags;
    expect(await byTitle('legacy camel')).toEqual(['work/suite', 'Work']);
    expect(await byTitle('legacy child')).toEqual(['work/suite/roadmap']);
    expect(await byTitle('standard')).toEqual(['work/suite']);
    expect(await byTitle('not a child')).toEqual(['geekSuiteboat']);
    expect((await Note.findOne({ userId: BOB })).tags).toEqual(['GeekSuite']);
  });

  test('deleteTag removes legacy spellings of the subtree', async () => {
    await Mutation.deleteTag(null, { tag: 'geek-suite' }, ctx(ALICE));
    const byTitle = async (title) => (await Note.findOne({ userId: ALICE, title })).tags;
    expect(await byTitle('legacy camel')).toEqual(['Work']);
    expect(await byTitle('legacy child')).toEqual([]);
    expect(await byTitle('not a child')).toEqual(['geekSuiteboat']);
    expect((await Note.findOne({ userId: BOB })).tags).toEqual(['GeekSuite']);
  });
});
