/**
 * bookgeekTags.test.js — the tag vocabulary at the gateway
 * (apps/bookgeek/DOCS/TAGS.md; graphql/bookgeek/{filters,resolvers}.js).
 *
 * Rules pinned here:
 *   - the Tags facet counts canonical ∪ My ∪ Unsorted tags, and `myTags`
 *     names which values are someone's own; both exclude their own filter;
 *   - a chosen canonical tag matches libraryTags and a My tag of that name;
 *     a raw tag from an old link or view still matches through the synonyms;
 *   - `tag:` in a search matches canonical names and their synonyms, and
 *     Unsorted/My tags as written (any case) — as an escaped literal;
 *   - updateBook rederives libraryTags/unsortedTags from a `tags` write,
 *     stores myTags as typed, and never touches `tags` for a myTags edit;
 *     createBook writes the derived fields;
 *   - Book.libraryTags/unsortedTags derive on read for a document that
 *     predates them (before the boot migration);
 *   - a saved view's tags are mapped when it loads (`viewTags`), for C2
 *     filter JSON and the legacy tagFilter alike, and nothing is stored.
 */

import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { Profile } = await import('../graphql/bookgeek/models/profile.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');
const { default: bookShared } = await import('@geeksuite/schemas/bookgeek/book');
const { deriveTagFields } = bookShared.tagVocabulary;

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: id ? { id } : null });

beforeAll(async () => {
  await Book.db.asPromise();
  await Profile.init();
}, 60000);

afterEach(async () => {
  await Promise.all([Book.deleteMany({}), Profile.deleteMany({})]);
});

afterAll(async () => {
  await Book.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const book = (title, tags, extra = {}) => ({ title, tags, ...deriveTagFields(tags), ...extra });

/**
 *   title        raw tags                                   → libraryTags                  unsorted       myTags
 *   Lock In      Science Fiction, Mystery Thriller          Sci-fi, Mystery, Thriller      —              —
 *   Gravel       Biography Memoir, jonestown                Memoir, Biography              jonestown      Must reread
 *   Dune         sf_horror, AUTO, Fiction                   Sci-fi, Horror                 —              Fantasy
 *   Hillbilly    growing-up-poor, Audiobook                 —                              growing-up-poor —
 *   Snuff        Thrillers                                  Thriller                       —              —
 */
const seed = () =>
  Book.create([
    book('Lock In', ['Science Fiction', 'Mystery Thriller']),
    book('The Sound of Gravel', ['Biography Memoir', 'jonestown'], { myTags: ['Must reread'] }),
    book('Dune', ['sf_horror', 'AUTO', 'Fiction'], { myTags: ['Fantasy'] }),
    book('Hillbilly Elegy', ['growing-up-poor', 'Audiobook']),
    book('Snuff', ['Thrillers']),
  ]);

const facets = (filter) => Query.bookFacets(null, filter === undefined ? {} : { filter }, ctx(ALICE));
const titles = async (args) => (await Query.books(null, { limit: 100, ...args }, ctx(ALICE))).items.map((b) => b.title).sort();
const counts = (list) => Object.fromEntries(list.map((v) => [v.value, v.count]));

describe('the Tags facet', () => {
  beforeEach(seed);

  test('counts canonical ∪ My ∪ Unsorted values, once per book; drops never appear', async () => {
    const f = await facets();
    expect(counts(f.tags)).toEqual({
      'Sci-fi': 2, Thriller: 2, Mystery: 1, Horror: 1, Memoir: 1, Biography: 1,
      // Dune's own "Fantasy" is the canonical value, not a second one.
      Fantasy: 1,
      'Must reread': 1, jonestown: 1, 'growing-up-poor': 1,
    });
    for (const gone of ['Fiction', 'AUTO', 'Audiobook', 'Science Fiction', 'Thrillers']) expect(counts(f.tags)[gone]).toBeUndefined();
  });

  test('myTags names the values that are someone’s own, under the same filter', async () => {
    expect(counts((await facets()).myTags)).toEqual({ 'Must reread': 1, Fantasy: 1 });
    // Excludes its own (tags) filter, like the tags facet…
    expect(counts((await facets({ tags: ['Memoir'] })).myTags)).toEqual({ 'Must reread': 1, Fantasy: 1 });
    // …and narrows under every other one.
    expect(counts((await facets({ q: 'gravel' })).myTags)).toEqual({ 'Must reread': 1 });
  });

  test('picking a tag keeps every tag countable and narrows the rest', async () => {
    const f = await facets({ tags: ['Thriller'] });
    expect(f.total).toBe(2);
    expect(counts(f.tags)['Sci-fi']).toBe(2);
  });
});

describe('the tags filter', () => {
  beforeEach(seed);

  test('a canonical tag matches libraryTags and a My tag of that name', async () => {
    expect(await titles({ filter: { tags: ['Thriller'] } })).toEqual(['Lock In', 'Snuff']);
    expect(await titles({ filter: { tags: ['Fantasy'] } })).toEqual(['Dune']);
  });

  test('Unsorted and My tags match as written', async () => {
    expect(await titles({ filter: { tags: ['jonestown'] } })).toEqual(['The Sound of Gravel']);
    expect(await titles({ filter: { tags: ['Must reread'] } })).toEqual(['The Sound of Gravel']);
  });

  test('a raw tag from an old link or saved view still matches through the synonyms', async () => {
    expect(await titles({ filter: { tags: ['Thrillers'] } })).toEqual(['Lock In', 'Snuff']);
    expect(await titles({ filter: { tags: ['science fiction'] } })).toEqual(['Dune', 'Lock In']);
    // A dropped raw tag matches the raw tags it was.
    expect(await titles({ filter: { tags: ['AUTO'] } })).toEqual(['Dune']);
  });

  test('Any and All', async () => {
    expect(await titles({ filter: { tags: ['Horror', 'Memoir'] } })).toEqual(['Dune', 'The Sound of Gravel']);
    expect(await titles({ filter: { tags: ['Sci-fi', 'Thriller'], tagMatch: 'all' } })).toEqual(['Lock In']);
    expect(await titles({ filter: { tags: ['Sci-fi', 'Fantasy'], tagMatch: 'all' } })).toEqual(['Dune']);
  });
});

describe('tag: in a search', () => {
  beforeEach(seed);

  test('matches canonical names and their synonyms', async () => {
    expect(await titles({ filter: { q: 'tag:sci-fi' } })).toEqual(['Dune', 'Lock In']);
    expect(await titles({ filter: { q: 'tag:scifi' } })).toEqual(['Dune', 'Lock In']);
    expect(await titles({ filter: { q: 'tag:"science fiction"' } })).toEqual(['Dune', 'Lock In']);
    expect(await titles({ filter: { q: 'tag:thrillers' } })).toEqual(['Lock In', 'Snuff']);
    expect(await titles({ filter: { q: 'tag:MEMOIR' } })).toEqual(['The Sound of Gravel']);
  });

  test('matches Unsorted and My tags as written, any case, whole tag only', async () => {
    expect(await titles({ filter: { q: 'tag:Jonestown' } })).toEqual(['The Sound of Gravel']);
    expect(await titles({ filter: { q: 'tag:"must reread"' } })).toEqual(['The Sound of Gravel']);
    expect(await titles({ filter: { q: 'tag:jones' } })).toEqual([]);
  });

  test('combines with free text, and with each other', async () => {
    expect(await titles({ filter: { q: 'tag:sci-fi dune' } })).toEqual(['Dune']);
    expect(await titles({ filter: { q: 'tag:sci-fi tag:thriller' } })).toEqual(['Lock In']);
    // The old flat `q` arg reads it the same way.
    expect(await titles({ q: 'tag:horror' })).toEqual(['Dune']);
  });

  test('the term is a literal, never a regex', async () => {
    await Book.create(book('Regex bait', ['(a+)+$', 'C++']));
    await expect(titles({ filter: { q: 'tag:"(a+)+$"' } })).resolves.toEqual(['Regex bait']);
    expect(await titles({ filter: { q: 'tag:c++' } })).toEqual(['Regex bait']);
    expect(await titles({ filter: { q: 'tag:.*' } })).toEqual([]);
  });

  test('a plain search finds canonical and My tags too, and raw tags as before', async () => {
    expect(await titles({ filter: { q: 'must reread' } })).toEqual(['The Sound of Gravel']);
    expect(await titles({ filter: { q: 'Thrillers' } })).toEqual(['Snuff']);
    expect(await titles({ filter: { q: 'horror' } })).toEqual(['Dune']);
  });
});

describe('derive on write (gateway)', () => {
  // Green with or without the resolver's explicit derive: mongoose defaults
  // array paths to [], so this pins the outcome (a new book is filterable
  // and facet-countable from birth), not the line of code.
  test('a created book carries the derived fields', async () => {
    const created = await Mutation.createBook(null, { input: { title: 'Fresh' } }, ctx(ALICE));
    const stored = await Book.findById(created._id).lean();
    expect(stored.libraryTags).toEqual([]);
    expect(stored.unsortedTags).toEqual([]);
  });

  test('a tags write rederives libraryTags and unsortedTags in the same update', async () => {
    const [b] = await Book.create([book('Old tab', ['Fiction'])]);
    const out = await Mutation.updateBook(null, { id: String(b._id), input: { tags: ['Thrillers', 'kurt', 'General'] } }, ctx(ALICE));
    expect(out.tags).toEqual(['Thrillers', 'kurt', 'General']);
    expect(out.libraryTags).toEqual(['Thriller']);
    expect(out.unsortedTags).toEqual(['kurt']);
  });

  test('myTags are stored as typed (trimmed, deduped), never mapped, and leave tags alone', async () => {
    const [b] = await Book.create([book('Mine', ['Science Fiction', 'jonestown'])]);
    const out = await Mutation.updateBook(
      null,
      { id: String(b._id), input: { myTags: [' thrillers ', 'thrillers', 'Beach read'] } },
      ctx(ALICE)
    );
    expect(out.myTags).toEqual(['thrillers', 'Beach read']);
    expect(out.tags).toEqual(['Science Fiction', 'jonestown']);
    expect(out.libraryTags).toEqual(['Sci-fi']);
    expect(out.unsortedTags).toEqual(['jonestown']);
  });

  test('myTags go through validation like tags', async () => {
    const [b] = await Book.create([book('Bounds', [])]);
    await expect(
      Mutation.updateBook(null, { id: String(b._id), input: { myTags: ['x'.repeat(101)] } }, ctx(ALICE))
    ).rejects.toThrow();
  });
});

describe('Book fields', () => {
  test('libraryTags / unsortedTags derive on read for a document that predates them', async () => {
    await Book.collection.insertOne({ title: 'Pre-migration', tags: ['Thrillers', 'kurt', 'AUTO'] });
    const row = await Query.book(null, { id: String((await Book.findOne({ title: 'Pre-migration' }).lean())._id) }, ctx(ALICE));
    expect(row.libraryTags).toBeUndefined();
    expect(resolvers.Book.libraryTags(row)).toEqual(['Thriller']);
    expect(resolvers.Book.unsortedTags(row)).toEqual(['kurt']);
    expect(resolvers.Book.myTags(row)).toEqual([]);
  });

  test('stored fields win once they exist', () => {
    const row = { tags: ['Thrillers'], libraryTags: ['Horror'], unsortedTags: [] };
    expect(resolvers.Book.libraryTags(row)).toEqual(['Horror']);
  });
});

describe('saved views name raw tags: mapped when the view loads', () => {
  const view = (over) => ({ id: 'v', name: 'v', tagFilter: '', filter: undefined, ...over });

  test('C2 filter JSON: "Five-star memoirs" opens on Memoir', () => {
    expect(resolvers.BookSavedFilter.viewTags(view({ tagFilter: 'memoir', filter: { tags: ['memoir'], ratingMin: 5 } }))).toEqual(['Memoir']);
  });

  test('legacy tagFilter: "Unread sci-fi" opens on Sci-fi', () => {
    expect(resolvers.BookSavedFilter.viewTags(view({ tagFilter: 'science fiction', shelfFilter: 'unread' }))).toEqual(['Sci-fi']);
  });

  test('one raw tag can open on two; Unsorted and My tags stay as saved; no tags is []', () => {
    expect(resolvers.BookSavedFilter.viewTags(view({ filter: { tags: ['Science Fiction Fantasy', 'kurt', 'Sci-fi'] } }))).toEqual(['Sci-fi', 'Fantasy', 'kurt']);
    expect(resolvers.BookSavedFilter.viewTags(view({}))).toEqual([]);
  });

  test('nothing is rewritten in the stored profile', async () => {
    await Mutation.saveLibraryFilter(null, { input: { name: 'Old', tagFilter: 'thrillers', filter: { tags: ['thrillers'] } } }, ctx(ALICE));
    const [stored] = await Query.libraryFilters(null, {}, ctx(ALICE));
    expect(stored.filter.tags).toEqual(['thrillers']);
    expect(stored.tagFilter).toBe('thrillers');
    expect(resolvers.BookSavedFilter.viewTags(stored)).toEqual(['Thriller']);
  });
});
