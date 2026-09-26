/**
 * GameGeek's library query state: the whole `GameFilterInput`
 * (DOCS/TAGS_AND_FILTERS.md §B1) plus `owned`, sort, direction and the random
 * seed — described once as a schema for `@geeksuite/collection`'s URL codec,
 * which does the reading, writing and round-tripping.
 *
 * What stays here is GameGeek's: the URL keys, the vocabularies, the sorts
 * and their words, how state becomes `GetGames` variables, and how a saved
 * view (including the pre-§B1 legacy shape) opens.
 *
 * URL grammar — short keys, one per filter, defaults never written:
 *
 *   ?shelf=backlog&shelf=playing   multi-values are REPEATED params. Not comma
 *   &genre=RPG&tag=Roguelike       lists: a provider genre may contain a comma,
 *   &store=steam&platform=switch   and a repeated param round-trips any string.
 *   &format=subscription&mode=single
 *   &length=short&meta=no-match
 *   &match=all                     tagMatch (any is the default)
 *   &played=recent&fav=1&cover=0
 *   &decide=1                      needsDecision: "not installed anymore" (only true is written)
 *   &year=2010-2020                releaseYearMin–Max; "2010-" / "-2020" for one side
 *   &q=zelda
 *   &sort=random&seed=81234        seed only for random, so page 2 continues page 1
 *   &dir=desc
 *   &owned=true                    legacy (pre-filter), still honoured
 *
 * Old links keep working: `?shelf=backlog` and `?platform=switch` are simply
 * a one-value list, `?shelf=all` reads as "no shelf filter".
 */
import { createFilterCodec, integerBetween } from '@geeksuite/collection';

export { newSeed } from '@geeksuite/collection';

export const PAGE_SIZE = 48;

/** Every sort has a resolver case in the gateway (§B1 "Sorts"). */
export const SORT_ORDER = ['title', 'dateAdded', 'releaseDate', 'rating', 'lastPlayed', 'hoursPlayed', 'timeToBeat', 'random'];

export const SORT_LABELS = {
  title: 'Title',
  dateAdded: 'Recently added',
  releaseDate: 'Release date',
  rating: 'My rating',
  lastPlayed: 'Last played',
  hoursPlayed: 'Hours played',
  timeToBeat: 'Length',
  random: 'Shuffle',
};

/** One-word forms for the phone's sort pill, where "Recently added" would crowd the row. */
export const SORT_SHORT = {
  title: 'Title',
  dateAdded: 'Added',
  releaseDate: 'Released',
  rating: 'Rating',
  lastPlayed: 'Played',
  hoursPlayed: 'Hours',
  timeToBeat: 'Length',
  random: 'Shuffle',
};

/** The direction a sort starts in: A→Z and shortest-first; newest/most first for the rest. */
export const DEFAULT_DIR = {
  title: 'asc',
  dateAdded: 'desc',
  releaseDate: 'desc',
  rating: 'desc',
  lastPlayed: 'desc',
  hoursPlayed: 'desc',
  timeToBeat: 'asc',
  random: 'asc',
};

/** How each direction reads for each sort ("A → Z" beats "ascending"). */
export const DIR_LABELS = {
  title: { asc: 'A → Z', desc: 'Z → A' },
  dateAdded: { asc: 'Oldest first', desc: 'Newest first' },
  releaseDate: { asc: 'Oldest first', desc: 'Newest first' },
  rating: { asc: 'Lowest first', desc: 'Highest first' },
  lastPlayed: { asc: 'Longest ago', desc: 'Most recent' },
  hoursPlayed: { asc: 'Fewest first', desc: 'Most first' },
  timeToBeat: { asc: 'Shortest first', desc: 'Longest first' },
};

/** The sort config the codec and the SortMenu share. */
export const SORTS = {
  order: SORT_ORDER,
  default: 'title',
  random: 'random',
  defaultDir: DEFAULT_DIR,
  labels: SORT_LABELS,
  short: SORT_SHORT,
  dirLabels: DIR_LABELS,
};

export const PLAYED_VALUES = ['never', 'played', 'recent'];
export const LENGTH_VALUES = ['short', 'medium', 'long', 'epic', 'unknown'];
export const METADATA_VALUES = ['matched', 'no-match', 'ambiguous', 'pending', 'error', 'unlinked'];

/**
 * The schema. Field order is the URL's param order (list keys in chip
 * order), which is also the scroll-memory key's — keep it stable.
 */
export const LIBRARY_CODEC = createFilterCodec({
  fields: [
    { key: 'q', type: 'search', param: 'q' },
    { key: 'shelves', type: 'list', param: 'shelf', drop: ['all'] },
    { key: 'storefronts', type: 'list', param: 'store' },
    { key: 'platforms', type: 'list', param: 'platform' },
    { key: 'genres', type: 'list', param: 'genre' },
    { key: 'tags', type: 'list', param: 'tag' },
    { key: 'modes', type: 'list', param: 'mode' },
    { key: 'lengths', type: 'list', param: 'length', values: LENGTH_VALUES },
    { key: 'formats', type: 'list', param: 'format' },
    { key: 'metadata', type: 'list', param: 'meta', values: METADATA_VALUES },
    // Any/All over genres AND tags: a modifier, not a narrowing of its own.
    { key: 'tagMatch', type: 'enum', param: 'match', values: ['any', 'all'], default: 'any', counts: false, requires: ['genres', 'tags'] },
    { key: 'played', type: 'enum', param: 'played', values: PLAYED_VALUES, default: '' },
    { key: 'favorite', type: 'boolean', param: 'fav' },
    { key: 'hasCover', type: 'boolean', param: 'cover' },
    { key: 'needsDecision', type: 'flag', param: 'decide' },
    { key: 'releaseYear', type: 'range', param: 'year', minKey: 'releaseYearMin', maxKey: 'releaseYearMax', parse: integerBetween(1901, 2199) },
  ],
  // `owned` predates GameFilterInput: a separate `games` arg, still honoured.
  state: [{ key: 'owned', param: 'owned', values: ['true', 'false'], default: 'all' }],
  sorts: SORTS,
});

export const EMPTY_FILTER = LIBRARY_CODEC.EMPTY_FILTER;
export const DEFAULT_STATE = LIBRARY_CODEC.DEFAULT_STATE;

/** URLSearchParams → library state. Anything unknown falls back to its default. */
export const readLibraryState = LIBRARY_CODEC.read;
/** Library state → params, on top of `base` (whose foreign params survive). */
export const stateToParams = LIBRARY_CODEC.toParams;
/** Apply a patch (filter fields, `filter`, `owned`, `sort`/`dir`/`seed`) to the params. */
export const writeLibraryState = LIBRARY_CODEC.write;
/** The filter as `GameFilterInput`: only what narrows. `null` when nothing does. */
export const toFilterInput = LIBRARY_CODEC.toFilterInput;
/** How many narrowing selections are on — each list value counts, the search does not. */
export const activeFilterCount = LIBRARY_CODEC.activeCount;
/** Whether anything narrows the library at all (search included). */
export const isNarrowed = LIBRARY_CODEC.isNarrowed;
/** The comparable form of a search string (seed ignored, param order ignored). */
export const canonicalSearch = LIBRARY_CODEC.canonicalSearch;
/** A library link with one more value on `key` — the detail page's genre and tag chips. */
export const librarySearchWith = LIBRARY_CODEC.searchWith;

/** Library state → `GetGames` variables. `filter` carries every narrowing; `seed` only for random. */
export function buildGamesVariables(state, page = 1) {
  const sort = SORT_ORDER.includes(state.sort) ? state.sort : 'title';
  const vars = {
    page,
    limit: PAGE_SIZE,
    sort,
    sortDir: sort === 'random' ? 'asc' : state.dir === 'desc' ? 'desc' : 'asc',
  };
  const filter = toFilterInput(state.filter);
  if (filter) vars.filter = filter;
  if (sort === 'random' && state.seed) vars.seed = state.seed;
  if (state.owned === 'true' || state.owned === 'false') vars.owned = state.owned;
  return vars;
}

/**
 * A saved view → the search string that applies it. New views carry the whole
 * filter as JSON; views saved before §B1 only have the four legacy fields.
 * A shuffled view gets a fresh shuffle each time it is opened.
 */
export function savedViewSearch(view) {
  if (!view) return '';
  const filter =
    view.filter && typeof view.filter === 'object'
      ? view.filter
      : {
          q: view.searchQuery || '',
          shelves: view.shelfFilter && view.shelfFilter !== 'all' ? [view.shelfFilter] : [],
          platforms: view.platformFilter ? [view.platformFilter] : [],
        };
  return LIBRARY_CODEC.viewSearch({ filter, sort: view.sortBy, dir: view.sortDir, owned: view.ownedFilter });
}
