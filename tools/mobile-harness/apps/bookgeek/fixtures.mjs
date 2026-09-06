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

export const BOOKS = BOOK_ROWS.map(
  ([id, title, authors, shelf, rating, pageCount, publishedDate, readingProgress, tags, publisher, color]) => ({
    id, title, authors, shelf, rating, pageCount, publishedDate, readingProgress, tags, publisher, color,
    isbn: '9780765375865', isbn13: null, goodreadsId: '21418013', language: 'en',
    owned: shelf !== 'want-to-read',
    description:
      'Fifteen years from now, a new virus sweeps the globe. 95% of those afflicted experience nothing worse ' +
      'than fever and headaches. Four percent suffer acute meningitis. And one percent find themselves ' +
      '"locked in" — fully awake and aware, but unable to move or respond to stimulus.\n\nA gripping near-future thriller.',
    files: [{ format: 'epub', path: `/data/library/${id}.epub`, size: 1200000, addedAt: '2026-03-03' }],
    coverPath: `covers/${id}.jpg`, review: '', dateAdded: '2026-03-03', dateStarted: null,
    dateFinished: shelf === 'read' ? '2026-05-01' : null,
    readCount: shelf === 'read' ? 1 : 0, series: null, openLibraryId: null, asin: null,
    googleBooksId: null, source: 'calibre', createdAt: '2026-03-03', updatedAt: '2026-09-01',
  }),
);

export const SHELVES = {
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
  ],
};

const SAVED_FILTER = (id, name, over = {}) => ({
  id, name, sortBy: 'title', sortDir: 'asc', searchQuery: '', authorFilter: '',
  tagFilter: '', shelfFilter: 'all', ownedOnly: false, ownedFilter: 'all', ...over,
});

export const PROFILE = {
  userId: 'chef',
  kindleEmail: 'chef@kindle.com',
  deviceWord: 'mustang',
  customShelves: [{ id: 'custom-comfort-reads', label: 'Comfort reads' }],
  savedFilters: [
    SAVED_FILTER('f1', 'Kindle queue', { shelfFilter: 'on-reader' }),
    SAVED_FILTER('f2', 'Unread sci-fi', { shelfFilter: 'unread', tagFilter: 'science fiction' }),
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
].map((p) => ({ __typename: 'WhatNextPick', ...p, book: { __typename: 'Book', ...p.book } }));

export const DRAFT_BOOK_METADATA = {
  __typename: 'BookMetadataDraft',
  description: 'A near-future thriller about a virus that leaves the rare "locked in" fully aware but unable to move — drafted from title, author and publisher alone.',
  tags: ['sci-fi', 'near-future'],
  provenance: {
    __typename: 'AIProvenance',
    source: 'model', reason: null, model: 'llama-3.1-8b-instant', provider: 'groq', cached: false, callsToday: 1, cap: 20,
  },
};

export const OPS = {
  GetShelves: { shelves: SHELVES },
  // Profile data moved off bookgeek's REST onto the gateway 2026-09-05
  // (SUITE_TODO consolidation item 3); these used to be `**/api/profile/*`
  // and `**/api/ai/status` route stubs above.
  GetBookProfile: { bookProfile: PROFILE },
  GetLibraryFilters: { libraryFilters: PROFILE.savedFilters },
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
    let items = BOOKS;
    if (v.shelf) items = items.filter((b) => b.shelf === v.shelf);
    if (v.q) items = items.filter((b) => (b.title + b.authors.join()).toLowerCase().includes(String(v.q).toLowerCase()));
    if (v.tag) items = items.filter((b) => b.tags.includes(v.tag));
    return { books: { items, total: v.shelf || v.q || v.tag ? items.length : 223, page: 1, pageSize: 50 } };
  },
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route(/\/api\/books\/([^/]+)\/cover/, (r) => {
    const id = /\/api\/books\/([^/]+)\/cover/.exec(r.request().url())[1];
    return svg(r, coverSvg(BOOKS.find((b) => b.id === id) || BOOKS[0]));
  });
  await graphqlRoute(ctx, OPS);
}
