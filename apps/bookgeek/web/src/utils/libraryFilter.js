/**
 * BookGeek's library query state — the whole `BookFilterInput`
 * (apps/basegeek/packages/api/src/graphql/bookgeek/filters.js) plus sort,
 * direction and the shuffle seed — described once as a schema for
 * `@geeksuite/collection`'s URL codec, which does the reading, writing and
 * round-tripping (DOCS/BOOKGEEK_CLEANUP_PLAN.md, Phase C2).
 *
 * What stays here is BookGeek's: the URL keys, the sorts and their words,
 * how state becomes `GetBooks` variables, and how a saved view — including
 * the pre-C2 shape every existing saved filter has — opens.
 *
 * URL grammar — short keys, one per filter, defaults never written:
 *
 *   ?shelf=reading&shelf=on-reader   multi-values are REPEATED params (a tag
 *   &author=Ursula%20K.%20Le%20Guin  or an author may contain a comma)
 *   &series=Earthsea&tag=fantasy
 *   &match=all                       tagMatch (any is the default)
 *   &format=epub&lang=en
 *   &owned=1&file=1                  owned 1/0; file only when on
 *   &read=2020-2024                  dateFinished year; "2020-" / "-2024" for one side
 *   &stars=4-5                       whole stars
 *   &by=stephenson                   author CONTAINS — legacy saved filters only
 *   &q=dune
 *   &sort=random&seed=81234          seed only for random
 *   &dir=desc
 *
 * The Phase B links (`?shelf=read&tag=sf&q=…&sort=…&dir=…`) read the same;
 * `?shelf=all` is "no shelf filter".
 */
import { createFilterCodec, integerBetween } from "@geeksuite/collection";

export const PAGE_SIZE = 50;

/** Every sort has a `books` resolver case (bookgeekLibrarySorts.test.js); random is seeded. */
export const SORT_ORDER = [
  "title",
  "author",
  "dateAdded",
  "rating",
  "dateFinished",
  "pageCount",
  "publishedDate",
  "owned",
  "random",
];

export const SORT_LABELS = {
  title: "Title",
  author: "Author",
  dateAdded: "Recently added",
  rating: "My rating",
  dateFinished: "Date finished",
  pageCount: "Page count",
  publishedDate: "Published",
  owned: "Owned first",
  random: "Shuffle",
};

/** One-word forms for the phone's sort pill. */
export const SORT_SHORT = {
  title: "Title",
  author: "Author",
  dateAdded: "Added",
  rating: "Rating",
  dateFinished: "Finished",
  pageCount: "Pages",
  publishedDate: "Published",
  owned: "Owned",
  random: "Shuffle",
};

/**
 * The direction a sort starts in: A→Z and shortest-first; newest / highest /
 * owned first for the rest. (Before C2 every sort opened ascending, so a
 * Phase B link like `?sort=dateAdded` with no `dir` now opens newest first.
 * Saved filters always stored their `sortDir`, so every saved view keeps
 * its order.)
 */
export const DEFAULT_DIR = {
  title: "asc",
  author: "asc",
  dateAdded: "desc",
  rating: "desc",
  dateFinished: "desc",
  pageCount: "asc",
  publishedDate: "desc",
  owned: "desc",
  random: "asc",
};

/** How each direction reads for each sort ("Shortest first" beats "ascending"). */
export const DIR_LABELS = {
  title: { asc: "A → Z", desc: "Z → A" },
  author: { asc: "A → Z", desc: "Z → A" },
  dateAdded: { asc: "Oldest first", desc: "Newest first" },
  rating: { asc: "Lowest first", desc: "Highest first" },
  dateFinished: { asc: "Longest ago", desc: "Most recent" },
  pageCount: { asc: "Shortest first", desc: "Longest first" },
  publishedDate: { asc: "Oldest first", desc: "Newest first" },
  // `owned` is a Boolean sort: false before true ascending.
  owned: { asc: "Not owned first", desc: "Owned first" },
};

/** The sort config the codec and the SortMenu share. */
export const SORTS = {
  order: SORT_ORDER,
  default: "title",
  random: "random",
  defaultDir: DEFAULT_DIR,
  labels: SORT_LABELS,
  short: SORT_SHORT,
  dirLabels: DIR_LABELS,
};

/**
 * The schema. Field order is the URL's param order and the scroll-memory
 * key's — keep it stable.
 */
export const LIBRARY_CODEC = createFilterCodec({
  fields: [
    { key: "q", type: "search", param: "q" },
    { key: "shelves", type: "list", param: "shelf", drop: ["all"] },
    { key: "authors", type: "list", param: "author" },
    { key: "series", type: "list", param: "series" },
    { key: "tags", type: "list", param: "tag" },
    // Any/All over tags: a modifier, not a narrowing of its own.
    { key: "tagMatch", type: "enum", param: "match", values: ["any", "all"], default: "any", counts: false, requires: ["tags"] },
    { key: "formats", type: "list", param: "format" },
    { key: "languages", type: "list", param: "lang" },
    { key: "owned", type: "boolean", param: "owned" },
    { key: "hasFile", type: "flag", param: "file" },
    { key: "readYear", type: "range", param: "read", minKey: "readYearMin", maxKey: "readYearMax", parse: integerBetween(1000, 3000) },
    { key: "rating", type: "range", param: "stars", minKey: "ratingMin", maxKey: "ratingMax", parse: integerBetween(1, 5) },
    // The pre-C2 author filter was "contains" (`Stephenson` finds Neal
    // Stephenson). The facet is exact names, so old saved filters open
    // through this instead; nothing in the panel writes it.
    { key: "authorText", type: "search", param: "by" },
  ],
  sorts: SORTS,
});

export const EMPTY_FILTER = LIBRARY_CODEC.EMPTY_FILTER;

/** URLSearchParams → library state. Anything unknown falls back to its default. */
export const readLibraryState = LIBRARY_CODEC.read;
/** Library state → params, on top of `base` (whose foreign params survive). */
export const stateToParams = LIBRARY_CODEC.toParams;
/** The comparable form of a search string (seed ignored, param order ignored). */
export const canonicalSearch = LIBRARY_CODEC.canonicalSearch;
/** Whether anything narrows the library at all (search included). */
export const isNarrowed = LIBRARY_CODEC.isNarrowed;

/** Whether a URL names a shelf (a deep link's shelf beats the saved default). */
export function hasShelfParam(search) {
  return new URLSearchParams(search || "").has("shelf");
}

/** Library state → `GetBooks` variables. `filter` carries every narrowing; `seed` only for random. */
export function buildBooksVariables(state, page = 1) {
  const sort = SORT_ORDER.includes(state.sort) ? state.sort : "title";
  const vars = {
    page,
    limit: PAGE_SIZE,
    sort,
    sortDir: sort === "random" ? "asc" : state.dir === "desc" ? "desc" : "asc",
  };
  const filter = LIBRARY_CODEC.toFilterInput(state.filter);
  if (filter) vars.filter = filter;
  if (sort === "random" && state.seed) vars.seed = state.seed;
  return vars;
}

/** The variables for the list a query string shows (a create refreshes that list). */
export function booksVariablesFor(search, page = 1) {
  return buildBooksVariables(readLibraryState(new URLSearchParams(search || "")), page);
}

/**
 * A pre-C2 saved filter as a filter — exactly what its old "apply" did: the
 * search, the author ("contains"), the tag (exact) and the shelf ("all" is
 * none), with its sort. `ownedFilter`/`ownedOnly` were stored but the old
 * library never applied them, so honouring them now would open a DIFFERENT
 * list under the same name; they are left out on purpose.
 */
export function legacyViewFilter(view) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const shelf = text(view.shelfFilter);
  const tag = text(view.tagFilter);
  return {
    q: text(view.searchQuery),
    authorText: text(view.authorFilter),
    tags: tag ? [tag] : [],
    shelves: shelf && shelf !== "all" ? [shelf] : [],
  };
}

/**
 * A saved view → the search string that applies it. New views carry the
 * whole filter as JSON; views saved before C2 only have the legacy fields.
 * A shuffled view gets a fresh shuffle each time it is opened.
 */
export function savedViewSearch(view) {
  if (!view) return "";
  const filter = view.filter && typeof view.filter === "object" ? view.filter : legacyViewFilter(view);
  return LIBRARY_CODEC.viewSearch({ filter, sort: view.sortBy, dir: view.sortDir });
}

/**
 * The legacy fields a new view is saved with as well, so a tab still running
 * the pre-C2 bundle opens something close to it (the first shelf, the first
 * tag, the search). The new library reads `filter` and ignores these.
 */
export function legacyFieldsFor(filterInput) {
  const f = filterInput ?? {};
  return {
    searchQuery: f.q ?? "",
    authorFilter: f.authorText ?? "",
    tagFilter: f.tags?.length === 1 ? f.tags[0] : "",
    shelfFilter: f.shelves?.length === 1 ? f.shelves[0] : "all",
  };
}
