// BookGeek fixtures. Titles are Chef's real Goodreads export, because a
// library of "Book One / Book Two" hides exactly the bugs this harness is
// looking for: two-line clamps, long-title truncation, serif metrics.
import { svg, sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const BOOK_ROWS = [
  ['b1', 'Lock In', ['John Scalzi'], 'reading', 4, 336, '2014-08-26', 42, ['science fiction', 'mystery'], 'Tor Books', '#0c4a6e'],
  ['b2', 'The Sound of Gravel', ['Ruth Wariner'], 'read', 5, 336, '2016-01-05', 100, ['memoir'], 'Flatiron Books', '#3b2f2f'],
  ['b3', 'Flow My Tears, the Policeman Said', ['Philip K. Dick'], 'read', 4, 204, '1974-01-01', 100, ['science fiction'], 'Doubleday', '#4c1d95'],
  ['b4', 'The Road to Jonestown: Jim Jones and Peoples Temple', ['Jeff Guinn'], 'want-to-read', 0, 454, '2017-04-11', 0, ['history'], 'Simon & Schuster', '#7c2d12'],
  ['b5', "The Dryad's Crown", ['David Hopkins'], 'on-reader', 5, 569, '2023-03-01', 0, ['fantasy'], 'Independent', '#14532d'],
  ['b6', 'God Bless You, Mr. Rosewater', ['Kurt Vonnegut Jr.'], 'read', 3, 290, '1965-01-01', 100, ['satire'], 'Dial Press', '#334155'],
  ['b7', 'A Year and a Day on Just a Few Acres', ['Peter Larson'], 'unread', 0, 294, '2014-01-01', 0, ['homesteading'], 'Independent', '#78350f'],
  ['b8', 'Breaking Free', ['Rachel Jeffs'], 'read', 0, 400, '2017-11-14', 100, ['memoir'], 'Harper', '#1e3a5f'],
];

// Per-book extras the filter panel needs to show something real: formats as
// Calibre writes them (upper case), a couple of series, finished dates spread
// over a few years, one book in French and one with no file. Two have no cover
// art (`noCover`): their cover request 404s, as the real API does, so the
// grid shows BookGeek's cloth-bound placeholder beside real jackets.
const EXTRAS = {
  b1: { files: ['EPUB', 'AZW3'], series: { name: 'Lock In', index: 1 } },
  b2: { files: ['EPUB'], dateFinished: '2024-03-10' },
  b3: { files: ['EPUB', 'PDF'], dateFinished: '2021-11-02' },
  b4: { files: [], noCover: true },
  b5: { files: ['EPUB'], series: { name: "The Dryad's Crown", index: 1 }, language: 'fr' },
  b6: { files: ['MOBI'], dateFinished: '2022-07-19' },
  b7: { files: ['PDF'], noCover: true },
  b8: { files: ['EPUB'], dateFinished: '2024-01-28' },
};

export const BOOKS = BOOK_ROWS.map(
  ([id, title, authors, shelf, rating, pageCount, publishedDate, readingProgress, tags, publisher, color]) => ({
    // `__typename` because the library list lives in the Apollo cache since
    // BookGeek's Phase B (web/src/graphql/cachePolicies.js): a `Book` is
    // normalized by type + id, and the detail route reads it back by id.
    __typename: 'Book',
    id, title, authors, shelf, rating, pageCount, publishedDate, readingProgress, tags, publisher, color,
    isbn: '9780765375865', isbn13: null, goodreadsId: '21418013', language: 'en',
    owned: shelf !== 'want-to-read',
    description:
      'Fifteen years from now, a new virus sweeps the globe. 95% of those afflicted experience nothing worse ' +
      'than fever and headaches. Four percent suffer acute meningitis. And one percent find themselves ' +
      '"locked in" — fully awake and aware, but unable to move or respond to stimulus.\n\nA gripping near-future thriller.',
    files: EXTRAS[id].files.map((format) => ({
      __typename: 'BookFile', format, path: `/data/library/${id}.${format.toLowerCase()}`, size: 1200000, addedAt: '2026-03-03',
    })),
    coverPath: EXTRAS[id].noCover ? null : `covers/${id}.jpg`, review: '', dateAdded: '2026-03-03', dateStarted: null,
    dateFinished: EXTRAS[id].dateFinished ?? null,
    readCount: shelf === 'read' ? 1 : 0,
    series: EXTRAS[id].series ? { __typename: 'BookSeries', ...EXTRAS[id].series } : null,
    ...(EXTRAS[id].language ? { language: EXTRAS[id].language } : {}),
    openLibraryId: null, asin: null,
    googleBooksId: null, source: 'calibre', createdAt: '2026-03-03', updatedAt: '2026-09-01',
  }),
);

export const SHELVES = {
  __typename: 'ShelfStats',
  total: 223, owned: 190, unowned: 33,
  shelves: [
    { id: 'reading', count: 2 },
    { id: 'on-reader', count: 7 },
    { id: 'unread', count: 61 },
    { id: 'read', count: 118 },
    { id: 'want-to-read', count: 27 },
    { id: 'abandoned', count: 4 },
    { id: 'need-to-find', count: 3 },
    { id: 'custom-comfort-reads', count: 1 },
  ].map((entry) => ({ __typename: 'ShelfCount', ...entry })),
};

const SAVED_FILTER = (id, name, over = {}) => ({
  __typename: 'BookSavedFilter',
  id, name, sortBy: 'title', sortDir: 'asc', searchQuery: '', authorFilter: '',
  tagFilter: '', shelfFilter: 'all', ownedOnly: false, ownedFilter: 'all', filter: null, ...over,
});

export const PROFILE = {
  userId: 'chef',
  kindleEmail: 'chef@kindle.com',
  deviceWord: 'mustang',
  customShelves: [{ id: 'custom-comfort-reads', label: 'Comfort reads' }],
  savedFilters: [
    SAVED_FILTER('f1', 'Kindle queue', { shelfFilter: 'on-reader' }),
    SAVED_FILTER('f2', 'Unread sci-fi', { shelfFilter: 'unread', tagFilter: 'science fiction' }),
    // Saved since Phase C2: the whole filter as JSON.
    SAVED_FILTER('f3', 'Five-star memoirs', { sortBy: 'rating', sortDir: 'desc', tagFilter: 'memoir', filter: { tags: ['memoir'], ratingMin: 5 } }),
  ],
};

// A cover stands in for the real jacket: the right aspect ratio, a real title
// block, and a colour per book so the grid reads like a shelf in a screenshot.
function coverSvg(book) {
  const t = book.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".35"/>` +
    `</linearGradient></defs>` +
    `<rect width="400" height="600" fill="${book.color}"/><rect width="400" height="600" fill="url(#g)"/>` +
    `<foreignObject x="30" y="330" width="340" height="240">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Georgia,serif;color:#fff;font-size:34px;line-height:1.15">${t}` +
    `<div style="font-family:sans-serif;font-size:14px;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-top:14px">${book.authors[0]}</div>` +
    `</div></foreignObject></svg>`;
}

// The library assistant (DOCS/AI_IDEAS.md #4, Night 2 R117). Opt-in —
// `appPreferences.bookgeek.libraryAssistant` — so neither existing scene
// (which all visit `/`) requests either of these; used only by scenes.mjs's
// page-scoped '07-what-next' and '08-edit-metadata-draft' scenes.
//
// The real `GetWhatNext` query (`web/src/graphql/queries.js`) selects only
// `{ bookId why }` on each pick, never `book { ... }` — even though the
// gateway's `WhatNextPick.book` field exists and the resolver populates it
// (`apps/basegeek/packages/api/src/graphql/bookgeek/typeDefs.js:186-190`).
// `App.jsx`'s `.filter((p) => p?.book)` (~line 375) then discards every pick
// in production, so the shelf can never render there. That is a real bug,
// reported rather than fixed (out of this stream's `tools/mobile-harness/**`
// scope) — see the harness run report. This fixture attaches `book` anyway,
// deliberately broader than what the shipped query can ever receive, purely
// so `WhatNextShelf` itself (its render and its a11y) can be exercised.
export const WHAT_NEXT_PICKS = [
  { bookId: 'b4', why: 'You finished the last three history books you started.', book: BOOKS.find((b) => b.id === 'b4') },
  { bookId: 'b7', why: 'On your unread shelf the longest, and homesteading is a tag you keep returning to.', book: BOOKS.find((b) => b.id === 'b7') },
  { bookId: 'b5', why: 'Already on the reader — a five-star average from books you rated this high.', book: BOOKS.find((b) => b.id === 'b5') },
  { bookId: 'b3', why: 'Philip K. Dick is your most-reread author.', book: BOOKS.find((b) => b.id === 'b3') },
  { bookId: 'b6', why: 'A short read that matches the satire tag on your recent five-star ratings.', book: BOOKS.find((b) => b.id === 'b6') },
].map((p) => ({ __typename: 'WhatNextPick', ...p, book: { ...p.book, __typename: 'Book' } }));

export const DRAFT_BOOK_METADATA = {
  __typename: 'BookMetadataDraft',
  description: 'A near-future thriller about a virus that leaves the rare "locked in" fully aware but unable to move — drafted from title, author and publisher alone.',
  tags: ['sci-fi', 'near-future'],
  provenance: {
    __typename: 'AIProvenance',
    source: 'model', reason: null, model: 'llama-3.1-8b-instant', provider: 'groq', cached: false, callsToday: 1, cap: 20,
  },
};

// ── The faceted library (Phase C2): BookFilterInput over the fixture books,
// each facet counted under every filter but its own, like the gateway.
const SORT_KEYS = {
  title: (b) => b.title,
  author: (b) => b.authors[0] ?? '',
  rating: (b) => b.rating ?? 0,
  pageCount: (b) => b.pageCount ?? 0,
  publishedDate: (b) => b.publishedDate ?? '',
  dateFinished: (b) => b.dateFinished ?? '',
  dateAdded: (b) => b.dateAdded ?? '',
  owned: (b) => (b.owned ? 1 : 0),
};
const year = (d) => (d ? Number(String(d).slice(0, 4)) : null);
const formatsOf = (b) => [...new Set(b.files.map((f) => f.format.toLowerCase()))];
const VALUES = {
  shelves: (b) => [b.shelf],
  authors: (b) => b.authors,
  series: (b) => (b.series ? [b.series.name] : []),
  tags: (b) => b.tags,
  formats: formatsOf,
  languages: (b) => [b.language],
};
function matches(b, f, except) {
  const any = (key, list) => except === key || !list?.length || VALUES[key](b).some((v) => list.includes(v));
  if (f.q && !(b.title + b.authors.join()).toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.authorText && !b.authors.join().toLowerCase().includes(f.authorText.toLowerCase())) return false;
  if (!any('shelves', f.shelves) || !any('authors', f.authors) || !any('series', f.series) || !any('languages', f.languages)) return false;
  if (!any('formats', f.formats?.map((x) => x.toLowerCase()))) return false;
  if (except !== 'tags' && f.tags?.length && !(f.tagMatch === 'all' ? f.tags.every((t) => b.tags.includes(t)) : f.tags.some((t) => b.tags.includes(t)))) return false;
  if (except !== 'owned' && f.owned != null && Boolean(b.owned) !== f.owned) return false;
  if (except !== 'hasFile' && f.hasFile != null && (b.files.length > 0) !== f.hasFile) return false;
  const y = year(b.dateFinished);
  if (except !== 'readYears' && (f.readYearMin != null || f.readYearMax != null)) {
    if (y == null || (f.readYearMin != null && y < f.readYearMin) || (f.readYearMax != null && y > f.readYearMax)) return false;
  }
  if (except !== 'ratings' && (f.ratingMin != null || f.ratingMax != null)) {
    const r = Math.floor(b.rating || 0);
    if (r < (f.ratingMin ?? 1) || r > (f.ratingMax ?? 5)) return false;
  }
  return true;
}
function facets(f = {}) {
  const tally = (key) => {
    const counts = new Map();
    BOOKS.filter((b) => matches(b, f, key)).forEach((b) => [...new Set(VALUES[key](b))].forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    for (const v of f[key] ?? []) if (!counts.has(v)) counts.set(v, 0);
    return [...counts].map(([value, count]) => ({ __typename: 'BookFacetValue', value, count })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  };
  const hist = (key, bucketOf, field) => {
    const m = new Map();
    BOOKS.filter((b) => matches(b, f, key)).forEach((b) => {
      const k = bucketOf(b);
      if (k != null) m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m].sort((a, b) => a[0] - b[0]).map(([k, count]) => ({ __typename: field === 'year' ? 'BookYearBucket' : 'BookRatingBucket', [field]: k, count }));
  };
  return {
    __typename: 'BookFacets',
    total: BOOKS.filter((b) => matches(b, f)).length,
    ...Object.fromEntries(Object.keys(VALUES).map((k) => [k, tally(k)])),
    readYears: hist('readYears', (b) => year(b.dateFinished), 'year'),
    ratings: hist('ratings', (b) => (b.rating >= 1 ? Math.floor(b.rating) : null), 'rating'),
    owned: BOOKS.filter((b) => matches(b, f, 'owned') && b.owned).length,
    hasFile: BOOKS.filter((b) => matches(b, f, 'hasFile') && b.files.length).length,
  };
}

let savedFilters = [...PROFILE.savedFilters];

export const OPS = {
  GetShelves: { shelves: SHELVES },
  // Profile data moved off bookgeek's REST onto the gateway 2026-09-05
  // (SUITE_TODO consolidation item 3); these used to be `**/api/profile/*`
  // and `**/api/ai/status` route stubs above.
  GetBookProfile: { bookProfile: PROFILE },
  GetLibraryFilters: () => ({ libraryFilters: savedFilters }),
  GetBookAiStatus: {
    bookAiStatus: {
      enabled: true,
      apiKeyConfigured: true,
      baseGeekUrl: 'https://basegeek.clintgeek.com',
      model: 'basegeek-rotation',
      providers: 3,
    },
  },
  GetBooks: (v) => {
    let items = BOOKS.filter((b) => matches(b, v.filter || {}));
    if (v.shelf) items = items.filter((b) => b.shelf === v.shelf);
    if (v.q) items = items.filter((b) => (b.title + b.authors.join()).toLowerCase().includes(String(v.q).toLowerCase()));
    if (v.tag) items = items.filter((b) => b.tags.includes(v.tag));
    if (v.sort === 'random') {
      const seed = Number(v.seed) || 1;
      items = [...items].sort((a, b) => ((Number(a.id.slice(1)) * seed) % 97) - ((Number(b.id.slice(1)) * seed) % 97));
    } else {
      const key = SORT_KEYS[v.sort] ?? SORT_KEYS.title;
      items = [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      if (v.sortDir === 'desc') items.reverse();
    }
    const narrowed = v.shelf || v.q || v.tag || v.filter;
    return { books: { __typename: 'BookPage', items, total: narrowed ? items.length : 223, page: 1, pageSize: 50 } };
  },
  GetBookFacets: (v) => ({ bookFacets: facets(v.filter || {}) }),
  SaveLibraryFilter: (v) => {
    savedFilters = [...savedFilters, SAVED_FILTER(`v${savedFilters.length + 1}`, v.input.name, v.input)];
    return { saveLibraryFilter: savedFilters };
  },
  DeleteLibraryFilter: (v) => {
    savedFilters = savedFilters.filter((x) => x.id !== v.id);
    return { deleteLibraryFilter: savedFilters };
  },
  // `/book/:id` deep links (and any row the cache holds only partly).
  GetBook: (v) => ({ book: BOOKS.find((b) => b.id === v.id) ?? null }),
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route(/\/api\/books\/([^/]+)\/cover/, (r) => {
    const id = /\/api\/books\/([^/]+)\/cover/.exec(r.request().url())[1];
    const book = BOOKS.find((b) => b.id === id) || BOOKS[0];
    if (!book.coverPath) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Cover not found"}' });
    return svg(r, coverSvg(book));
  });
  await graphqlRoute(ctx, OPS);
}
