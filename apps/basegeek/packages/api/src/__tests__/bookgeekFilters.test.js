/**
 * bookgeekFilters.test.js — BookFilterInput, `bookFacets`, the seeded
 * shuffle and saved-view `filter` JSON (DOCS/BOOKGEEK_CLEANUP_PLAN.md, Phase
 * C2; graphql/bookgeek/filters.js).
 *
 * Rules pinned here:
 *   - every facet's counts apply every active filter EXCEPT its own;
 *   - the "unread" shelf is the resolver's rule (unread or no shelf, and not
 *     finished) in the counts as well as the list;
 *   - formats match case-insensitively (Calibre writes "EPUB"), a half-star
 *     rating counts under its floor, "not owned" is anything but true;
 *   - `books(filter:)` narrows by every field, and the old flat args keep
 *     their exact old semantics; given both, both narrow;
 *   - `sort: "random"` is stable per seed across pages, and differs by seed;
 *   - search input is a literal, never a regex;
 *   - a pre-C2 saved view, opened through the web's legacy mapping, asks for
 *     exactly the list its old apply did (LEGACY_VIEW — the web half is
 *     apps/bookgeek/web/src/__tests__/utils/libraryFilter.test.js);
 *   - the library stays household-SHARED: any signed-in user sees the same
 *     counts; nobody signed out sees any.
 */

import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { Profile } = await import('../graphql/bookgeek/models/profile.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');
const { default: bookShared } = await import('@geeksuite/schemas/bookgeek/book');
const { deriveTagFields } = bookShared.tagVocabulary;

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: id ? { id } : null });
const at = (y, m = 6) => new Date(Date.UTC(y, m - 1, 15));

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

const file = (format) => ({ format, path: `/lib/x.${format.toLowerCase()}`, size: 1 });

/**
 *   title            authors                 shelf          series     tags                 files        lang owned rating finished
 *   Anathem          Neal Stephenson         read           —          sf, philosophy       EPUB         en   true  5      2021
 *   Cryptonomicon    Neal Stephenson         (none)         —          sf, history          epub, PDF    en   —     3.5    2022  ← no shelf, finished: on NO shelf
 *   Dune             Frank Herbert           unread         Dune       sf                   —            en   true  —      —
 *   Dune Messiah     Frank Herbert           (none)         Dune       sf                   AZW3         en   false —      —     ← no shelf, unfinished: unread
 *   Earthsea         Ursula K. Le Guin       reading        Earthsea   fantasy              epub         fr   true  4      —
 *   The Farthest     Ursula K. Le Guin       unread         Earthsea   fantasy, classic     mobi         en   true  —      —     readCount 2: NOT unread
 *   Gravel           Ruth Wariner            custom-memoirs —          memoir               —            en   —     2      2022
 *   Hyperion         Dan Simmons             want-to-read   —          sf, classic          pdf          en   true  —      —
 */
// Seeded as every write path stores a book since the tag vocabulary
// (apps/bookgeek/DOCS/TAGS.md): raw `tags` plus the derived fields. `sf`,
// `philosophy`, `history`, `fantasy` and `memoir` map; `classic` stays Unsorted.
const derived = (docs) => docs.map((d) => ({ ...d, ...deriveTagFields(d.tags) }));
const seedLibrary = () =>
  Book.create(derived([
    { title: 'Anathem', authors: ['Neal Stephenson'], shelf: 'read', tags: ['sf', 'philosophy'], files: [file('EPUB')], language: 'en', owned: true, rating: 5, dateFinished: at(2021), readCount: 1, dateAdded: at(2020, 1) },
    { title: 'Cryptonomicon', authors: ['Neal Stephenson'], tags: ['sf', 'history'], files: [file('epub'), file('PDF')], language: 'en', rating: 3.5, dateFinished: at(2022), dateAdded: at(2020, 2) },
    { title: 'Dune', authors: ['Frank Herbert'], shelf: 'unread', series: { name: 'Dune', index: 1 }, tags: ['sf'], language: 'en', owned: true, dateAdded: at(2020, 3) },
    { title: 'Dune Messiah', authors: ['Frank Herbert'], series: { name: 'Dune', index: 2 }, tags: ['sf'], files: [file('AZW3')], language: 'en', owned: false, dateAdded: at(2020, 4) },
    { title: 'Earthsea', authors: ['Ursula K. Le Guin'], shelf: 'reading', series: { name: 'Earthsea', index: 1 }, tags: ['fantasy'], files: [file('epub')], language: 'fr', owned: true, rating: 4, dateAdded: at(2020, 5) },
    { title: 'The Farthest Shore', authors: ['Ursula K. Le Guin'], shelf: 'unread', series: { name: 'Earthsea', index: 3 }, tags: ['fantasy', 'classic'], files: [file('mobi')], language: 'en', owned: true, readCount: 2, dateAdded: at(2020, 6) },
    { title: 'The Sound of Gravel', authors: ['Ruth Wariner'], shelf: 'custom-memoirs', tags: ['memoir'], language: 'en', rating: 2, dateFinished: at(2022, 9), dateAdded: at(2020, 7) },
    { title: 'Hyperion', authors: ['Dan Simmons'], shelf: 'want-to-read', tags: ['sf', 'classic'], files: [file('pdf')], language: 'en', owned: true, dateAdded: at(2020, 8) },
  ]));

const facets = (filter, who = ALICE) => Query.bookFacets(null, filter === undefined ? {} : { filter }, ctx(who));
const titles = async (args) => (await Query.books(null, { limit: 100, ...args }, ctx(ALICE))).items.map((b) => b.title);
const counts = (list) => Object.fromEntries(list.map((v) => [v.value, v.count]));

describe('bookFacets — every facet, unfiltered', () => {
  beforeEach(seedLibrary);

  test('total, shelves (the unread rule), authors, series, tags', async () => {
    const f = await facets();
    expect(f.total).toBe(8);
    // Dune + Dune Messiah (no shelf, unfinished) are unread; The Farthest Shore
    // (readCount 2) and Cryptonomicon (no shelf, finished) are on no shelf.
    expect(counts(f.shelves)).toEqual({ unread: 2, read: 1, reading: 1, 'custom-memoirs': 1, 'want-to-read': 1 });
    expect(counts(f.authors)).toEqual({ 'Neal Stephenson': 2, 'Frank Herbert': 2, 'Ursula K. Le Guin': 2, 'Ruth Wariner': 1, 'Dan Simmons': 1 });
    expect(counts(f.series)).toEqual({ Dune: 2, Earthsea: 2 });
    // The canonical tags plus the Unsorted `classic`; raw spellings are gone.
    expect(counts(f.tags)).toEqual({ 'Sci-fi': 5, classic: 2, Fantasy: 2, History: 1, Memoir: 1, Philosophy: 1 });
    // Sorted by count, then value.
    expect(f.tags.map((t) => t.value)).toEqual(['Sci-fi', 'Fantasy', 'classic', 'History', 'Memoir', 'Philosophy']);
    expect(f.myTags).toEqual([]);
  });

  test('formats (lowercased, once per book), languages, read years, ratings (half stars floor), owned, has a file', async () => {
    const f = await facets();
    expect(counts(f.formats)).toEqual({ epub: 3, pdf: 2, azw3: 1, mobi: 1 });
    expect(counts(f.languages)).toEqual({ en: 7, fr: 1 });
    expect(f.readYears).toEqual([{ year: 2021, count: 1 }, { year: 2022, count: 2 }]);
    expect(f.ratings).toEqual([{ rating: 2, count: 1 }, { rating: 3, count: 1 }, { rating: 4, count: 1 }, { rating: 5, count: 1 }]);
    expect(f.owned).toBe(5);
    expect(f.hasFile).toBe(6);
  });

  test('the library is shared: Bob sees the same counts; signed out sees nothing', async () => {
    expect(await facets(undefined, BOB)).toEqual(await facets(undefined, ALICE));
    await expect(Query.bookFacets(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
    await expect(Query.books(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
  });
});

describe('bookFacets — each facet excludes its own filter', () => {
  beforeEach(seedLibrary);

  test('picking an author keeps every author countable, and narrows the rest', async () => {
    const f = await facets({ authors: ['Neal Stephenson'] });
    expect(f.total).toBe(2);
    // Its own facet ignores its own choice…
    expect(counts(f.authors)).toEqual({ 'Neal Stephenson': 2, 'Frank Herbert': 2, 'Ursula K. Le Guin': 2, 'Ruth Wariner': 1, 'Dan Simmons': 1 });
    // …every other facet is under it.
    expect(counts(f.tags)).toEqual({ 'Sci-fi': 2, Philosophy: 1, History: 1 });
    expect(counts(f.formats)).toEqual({ epub: 2, pdf: 1 });
    expect(f.owned).toBe(1);
  });

  test('two filters: each facet is under the other one only', async () => {
    const f = await facets({ tags: ['sf'], shelves: ['unread'] });
    expect(f.total).toBe(2);
    // Shelves under tags=sf only: Anathem read, Dune + Dune Messiah unread, Hyperion want (Cryptonomicon on none).
    expect(counts(f.shelves)).toEqual({ read: 1, unread: 2, 'want-to-read': 1 });
    // Tags under shelf=unread only: Dune, Dune Messiah. (The raw `sf` of an
    // old link filters through the vocabulary; the facet names it Sci-fi.)
    expect(counts(f.tags)).toEqual({ 'Sci-fi': 2, sf: 0 });
  });

  test('a selected value with no books still comes back, at zero', async () => {
    const f = await facets({ tags: ['fantasy'], authors: ['Nobody'] });
    expect(counts(f.authors).Nobody).toBe(0);
    expect(f.total).toBe(0);
  });

  test('the switches and ranges exclude their own too', async () => {
    const f = await facets({ owned: true, hasFile: true, readYearMin: 2022, ratingMin: 3, ratingMax: 3 });
    // owned counts under everything but owned: Cryptonomicon (3.5, 2022, files) — not owned.
    expect(f.owned).toBe(0);
    expect(f.total).toBe(0);
    const g = await facets({ ratingMin: 4 });
    expect(g.ratings).toEqual([{ rating: 2, count: 1 }, { rating: 3, count: 1 }, { rating: 4, count: 1 }, { rating: 5, count: 1 }]);
    expect(g.readYears).toEqual([{ year: 2021, count: 1 }]);
  });
});

describe('books(filter:)', () => {
  beforeEach(seedLibrary);

  test('each field narrows', async () => {
    expect(await titles({ filter: { shelves: ['unread'] } })).toEqual(['Dune', 'Dune Messiah']);
    expect(await titles({ filter: { shelves: ['reading', 'custom-memoirs'] } })).toEqual(['Earthsea', 'The Sound of Gravel']);
    expect(await titles({ filter: { authors: ['Frank Herbert'] } })).toEqual(['Dune', 'Dune Messiah']);
    expect(await titles({ filter: { series: ['Earthsea'] } })).toEqual(['Earthsea', 'The Farthest Shore']);
    expect(await titles({ filter: { tags: ['classic', 'memoir'] } })).toEqual(['Hyperion', 'The Farthest Shore', 'The Sound of Gravel']);
    expect(await titles({ filter: { tags: ['sf', 'classic'], tagMatch: 'all' } })).toEqual(['Hyperion']);
    expect(await titles({ filter: { formats: ['epub'] } })).toEqual(['Anathem', 'Cryptonomicon', 'Earthsea']);
    expect(await titles({ filter: { formats: ['PDF'] } })).toEqual(['Cryptonomicon', 'Hyperion']);
    expect(await titles({ filter: { languages: ['fr'] } })).toEqual(['Earthsea']);
    expect(await titles({ filter: { owned: false } })).toEqual(['Cryptonomicon', 'Dune Messiah', 'The Sound of Gravel']);
    expect(await titles({ filter: { hasFile: false } })).toEqual(['Dune', 'The Sound of Gravel']);
    expect(await titles({ filter: { readYearMin: 2022, readYearMax: 2022 } })).toEqual(['Cryptonomicon', 'The Sound of Gravel']);
    expect(await titles({ filter: { ratingMin: 3, ratingMax: 4 } })).toEqual(['Cryptonomicon', 'Earthsea']);
    expect(await titles({ filter: { ratingMax: 2 } })).toEqual(['The Sound of Gravel']);
    expect(await titles({ filter: { authorText: 'le gui' } })).toEqual(['Earthsea', 'The Farthest Shore']);
    expect(await titles({ filter: { q: 'dune' } })).toEqual(['Dune', 'Dune Messiah']);
  });

  test('the total follows the filter, and the sorts still apply', async () => {
    const page = await Query.books(null, { filter: { tags: ['sf'] }, sort: 'dateAdded', sortDir: 'desc', limit: 2 }, ctx(ALICE));
    expect(page.total).toBe(5);
    expect(page.items.map((b) => b.title)).toEqual(['Hyperion', 'Dune Messiah']);
  });

  test('search input is a literal, not a regex', async () => {
    await Book.create({ title: 'C++ (Deluxe', authors: ['X'] });
    expect(await titles({ filter: { q: 'C++ (' } })).toEqual(['C++ (Deluxe']);
    expect(await titles({ filter: { q: '(a+)+$' } })).toEqual([]);
    expect(await titles({ filter: { authorText: '.*' } })).toEqual([]);
  });

  test('a malformed filter is BAD_USER_INPUT, not a query', async () => {
    await expect(Query.books(null, { filter: { ratingMin: 9 } }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(Query.books(null, { filter: { nope: 1 } }, ctx(ALICE))).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(Query.bookFacets(null, { filter: { readYearMin: 2024, readYearMax: 2020 } }, ctx(ALICE))).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});

describe('the old flat args still work', () => {
  beforeEach(seedLibrary);

  test('shelf, author (contains), tag (exact), owned, q — as before', async () => {
    expect(await titles({ shelf: 'unread' })).toEqual(['Dune', 'Dune Messiah']);
    expect(await titles({ author: 'stephen' })).toEqual(['Anathem', 'Cryptonomicon']);
    expect(await titles({ tag: 'classic' })).toEqual(['Hyperion', 'The Farthest Shore']);
    expect(await titles({ tag: 'Classic' })).toEqual([]);
    // "false" is a stored false, exactly as before (the model defaults owned to false).
    expect(await titles({ owned: 'false' })).toEqual(['Cryptonomicon', 'Dune Messiah', 'The Sound of Gravel']);
    expect(await titles({ owned: 'true', q: 'earth' })).toEqual(['Earthsea']);
    expect(await titles({ q: 'C++ (' })).toEqual([]);
  });

  test('given both, both narrow', async () => {
    expect(await titles({ shelf: 'unread', filter: { authors: ['Frank Herbert'], hasFile: true } })).toEqual(['Dune Messiah']);
  });
});

describe('sort: random (seeded)', () => {
  beforeEach(seedLibrary);

  const pages = async (seed) => {
    const out = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await Query.books(null, { sort: 'random', seed, page, limit: 3 }, ctx(ALICE));
      expect(res.total).toBe(8);
      out.push(...res.items.map((b) => b.title));
    }
    return out;
  };

  test('the same seed is the same order on every page, every time — each book once', async () => {
    const a = await pages(12345);
    expect(await pages(12345)).toEqual(a);
    expect(new Set(a).size).toBe(8);
  });

  test('another seed is another order, and the filter still applies', async () => {
    const orders = new Set();
    for (const seed of [1, 2, 3, 4, 5]) orders.add((await pages(seed)).join('|'));
    expect(orders.size).toBeGreaterThan(1);
    const sf = await Query.books(null, { sort: 'random', seed: 7, filter: { tags: ['sf'] } }, ctx(ALICE));
    expect(sf.total).toBe(5);
    expect(sf.items.map((b) => b.title).sort()).toEqual(['Anathem', 'Cryptonomicon', 'Dune', 'Dune Messiah', 'Hyperion']);
  });
});

describe('saved views', () => {
  beforeEach(seedLibrary);

  // A pre-C2 saved filter, as real profiles hold them (the web test replays the same one).
  const LEGACY_VIEW = {
    name: 'Unread sci-fi', sortBy: 'dateAdded', sortDir: 'desc',
    searchQuery: 'dune', authorFilter: 'herb', tagFilter: 'sf', shelfFilter: 'unread', ownedFilter: 'owned',
  };
  // …and what apps/bookgeek/web/src/utils/libraryFilter.js savedViewSearch →
  // buildBooksVariables turns it into.
  const LEGACY_AS_FILTER = { q: 'dune', shelves: ['unread'], tags: ['sf'], authorText: 'herb' };

  test('a legacy view round-trips: books(filter) of its mapping = books(old args) of its fields', async () => {
    // What the pre-C2 web sent for this view (its owned setting was never sent).
    const old = await Query.books(null, { q: 'dune', author: 'herb', tag: 'sf', shelf: 'unread', sort: 'dateAdded', sortDir: 'desc' }, ctx(ALICE));
    const now = await Query.books(null, { filter: LEGACY_AS_FILTER, sort: 'dateAdded', sortDir: 'desc' }, ctx(ALICE));
    expect(old.items.map((b) => b.title)).toEqual(['Dune Messiah', 'Dune']);
    expect(now.items.map((b) => b.title)).toEqual(old.items.map((b) => b.title));
    expect(now.total).toBe(old.total);
  });

  test('a new view stores the whole filter, beside the legacy fields', async () => {
    await Mutation.saveLibraryFilter(null, { input: LEGACY_VIEW }, ctx(ALICE));
    const filter = { shelves: ['read', 'custom-memoirs'], ratingMin: 4, tagMatch: 'all', tags: ['sf', 'philosophy'] };
    const list = await Mutation.saveLibraryFilter(
      null,
      { input: { name: 'Best', sortBy: 'rating', sortDir: 'desc', filter, shelfFilter: 'all' } },
      ctx(ALICE)
    );
    expect(list).toHaveLength(2);
    expect(list[0].filter).toBeUndefined();
    expect(list[1]).toMatchObject({ name: 'Best', sortBy: 'rating', filter });
    const stored = await Query.libraryFilters(null, {}, ctx(ALICE));
    expect(stored[1].filter).toEqual(filter);
    expect(await Query.libraryFilters(null, {}, ctx(BOB))).toEqual([]);
  });

  test('a view whose filter the query would refuse is refused too', async () => {
    await expect(
      Mutation.saveLibraryFilter(null, { input: { name: 'Bad', filter: { ratingMin: 0 } } }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});
