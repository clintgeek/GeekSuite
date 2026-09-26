/**
 * The library's query state: the whole `GameFilterInput`
 * (DOCS/TAGS_AND_FILTERS.md §B1) plus sort, direction and the random seed —
 * and the one codec that moves it in and out of the URL.
 *
 * Everything lives in the query string, so a filtered library is a link, back
 * and forward work, and the detail sheet at `/game/:id?…` closes onto exactly
 * the library it opened from. `useLibraryFilter()` is the only thing that
 * should call these from a component; they stay pure so the codec can be
 * tested without a router.
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

export const PLAYED_VALUES = ['never', 'played', 'recent'];
export const LENGTH_VALUES = ['short', 'medium', 'long', 'epic', 'unknown'];
export const METADATA_VALUES = ['matched', 'no-match', 'ambiguous', 'pending', 'error', 'unlinked'];

/** List keys: filter field → URL param. Order is the chip order. */
export const LIST_KEYS = {
  shelves: 'shelf',
  storefronts: 'store',
  platforms: 'platform',
  genres: 'genre',
  tags: 'tag',
  modes: 'mode',
  lengths: 'length',
  formats: 'format',
  metadata: 'meta',
};

const ENUMS = { lengths: LENGTH_VALUES, metadata: METADATA_VALUES };

export const EMPTY_FILTER = Object.freeze({
  q: '',
  shelves: [],
  genres: [],
  tags: [],
  tagMatch: 'any',
  storefronts: [],
  platforms: [],
  formats: [],
  modes: [],
  played: '',
  favorite: null,
  releaseYearMin: null,
  releaseYearMax: null,
  lengths: [],
  metadata: [],
  hasCover: null,
  needsDecision: null,
});

export const DEFAULT_STATE = Object.freeze({
  filter: EMPTY_FILTER,
  owned: 'all',
  sort: 'title',
  dir: 'asc',
  seed: null,
});

const uniq = (values) => [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];

const toYear = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 1900 && n < 2200 ? n : null;
};

const toBool = (raw) => (raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : null);

/** A random seed for `sort=random`: a positive 31-bit int (a GraphQL Int). */
export function newSeed() {
  return 1 + Math.floor(Math.random() * 2147483646);
}

/** URLSearchParams → library state. Anything unknown falls back to its default. */
export function readLibraryState(params) {
  const get = (k) => params.get(k) ?? '';
  const filter = { ...EMPTY_FILTER, q: get('q') };

  for (const [key, param] of Object.entries(LIST_KEYS)) {
    let values = uniq(params.getAll(param));
    if (key === 'shelves') values = values.filter((v) => v !== 'all');
    if (ENUMS[key]) values = values.filter((v) => ENUMS[key].includes(v));
    filter[key] = values;
  }

  filter.tagMatch = get('match') === 'all' ? 'all' : 'any';
  filter.played = PLAYED_VALUES.includes(get('played')) ? get('played') : '';
  filter.favorite = toBool(get('fav'));
  filter.hasCover = toBool(get('cover'));
  filter.needsDecision = toBool(get('decide')) === true ? true : null;

  const [lo = '', hi = ''] = get('year').split('-');
  let min = toYear(lo);
  let max = toYear(hi);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  filter.releaseYearMin = min;
  filter.releaseYearMax = max;

  const sort = SORT_ORDER.includes(get('sort')) ? get('sort') : DEFAULT_STATE.sort;
  const dir = get('dir') === 'asc' || get('dir') === 'desc' ? get('dir') : DEFAULT_DIR[sort];
  const seedNum = Number(get('seed'));
  const seed = sort === 'random' && Number.isInteger(seedNum) && seedNum > 0 ? seedNum : null;
  const owned = get('owned') === 'true' || get('owned') === 'false' ? get('owned') : 'all';

  return { filter, owned, sort, dir, seed };
}

/** Every param this codec owns; anything else in the URL is left alone. */
const OWN_PARAMS = ['q', ...Object.values(LIST_KEYS), 'match', 'played', 'fav', 'cover', 'decide', 'year', 'sort', 'dir', 'seed', 'owned'];

/** Library state → params, on top of `base` (whose foreign params survive). */
export function stateToParams(state, base = new URLSearchParams()) {
  const next = new URLSearchParams(base);
  OWN_PARAMS.forEach((k) => next.delete(k));
  const f = { ...EMPTY_FILTER, ...state.filter };

  if (f.q && f.q.trim()) next.set('q', f.q);
  for (const [key, param] of Object.entries(LIST_KEYS)) {
    uniq(f[key] || []).forEach((v) => next.append(param, v));
  }
  if (f.tagMatch === 'all') next.set('match', 'all');
  if (PLAYED_VALUES.includes(f.played)) next.set('played', f.played);
  if (f.favorite === true || f.favorite === false) next.set('fav', f.favorite ? '1' : '0');
  if (f.hasCover === true || f.hasCover === false) next.set('cover', f.hasCover ? '1' : '0');
  if (f.needsDecision === true) next.set('decide', '1');
  if (f.releaseYearMin != null || f.releaseYearMax != null) {
    next.set('year', `${f.releaseYearMin ?? ''}-${f.releaseYearMax ?? ''}`);
  }
  if (state.owned === 'true' || state.owned === 'false') next.set('owned', state.owned);

  const sort = SORT_ORDER.includes(state.sort) ? state.sort : DEFAULT_STATE.sort;
  if (sort !== DEFAULT_STATE.sort) next.set('sort', sort);
  if (sort === 'random') {
    if (state.seed) next.set('seed', String(state.seed));
  } else if (state.dir && state.dir !== DEFAULT_DIR[sort]) {
    next.set('dir', state.dir);
  }
  return next;
}

/**
 * Apply a patch to the params. `patch` may carry filter fields directly
 * (`{ genres: ['RPG'] }`) or state fields (`{ sort, dir, seed, owned }`).
 * A new sort resets the direction to that sort's natural one, and picking
 * random mints a seed when none is given.
 */
export function writeLibraryState(params, patch = {}) {
  const current = readLibraryState(params);
  const { sort, dir, seed, owned, filter: filterPatch, ...fields } = patch;
  const next = {
    ...current,
    filter: { ...current.filter, ...filterPatch, ...fields },
  };
  if (owned !== undefined) next.owned = owned;
  if (sort !== undefined) {
    next.sort = sort;
    next.dir = dir ?? DEFAULT_DIR[sort] ?? 'asc';
    if (sort === 'random') next.seed = seed ?? (current.sort === 'random' && current.seed ? current.seed : newSeed());
  } else if (dir !== undefined) {
    next.dir = dir;
  }
  if (seed !== undefined && sort === undefined) next.seed = seed;
  return stateToParams(next, params);
}

/** The filter as `GameFilterInput`: only what narrows. `null` when nothing does. */
export function toFilterInput(filter) {
  const f = { ...EMPTY_FILTER, ...filter };
  const out = {};
  const q = (f.q || '').trim();
  if (q) out.q = q;
  for (const key of Object.keys(LIST_KEYS)) {
    const values = uniq(f[key] || []);
    if (values.length) out[key] = values;
  }
  if (f.tagMatch === 'all' && (out.genres || out.tags)) out.tagMatch = 'all';
  if (PLAYED_VALUES.includes(f.played)) out.played = f.played;
  if (f.favorite === true || f.favorite === false) out.favorite = f.favorite;
  if (f.releaseYearMin != null) out.releaseYearMin = f.releaseYearMin;
  if (f.releaseYearMax != null) out.releaseYearMax = f.releaseYearMax;
  if (f.hasCover === true || f.hasCover === false) out.hasCover = f.hasCover;
  if (f.needsDecision === true) out.needsDecision = true;
  return Object.keys(out).length ? out : null;
}

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

/** How many narrowing selections are on — each list value counts, the search does not. */
export function activeFilterCount(state) {
  const f = { ...EMPTY_FILTER, ...state.filter };
  let n = 0;
  for (const key of Object.keys(LIST_KEYS)) n += (f[key] || []).length;
  if (f.played) n += 1;
  if (f.favorite !== null) n += 1;
  if (f.releaseYearMin != null || f.releaseYearMax != null) n += 1;
  if (f.hasCover !== null) n += 1;
  if (f.needsDecision === true) n += 1;
  if (state.owned && state.owned !== 'all') n += 1;
  return n;
}

/** Whether anything narrows the library at all (search included). */
export function isNarrowed(state) {
  return activeFilterCount(state) > 0 || Boolean((state.filter?.q || '').trim());
}

/**
 * A saved view → the search string that applies it. New views carry the whole
 * filter as JSON; views saved before §B1 only have the four legacy fields.
 */
export function savedViewSearch(view) {
  if (!view) return '';
  let filter;
  if (view.filter && typeof view.filter === 'object') {
    filter = { ...EMPTY_FILTER, ...view.filter };
  } else {
    filter = {
      ...EMPTY_FILTER,
      q: view.searchQuery || '',
      shelves: view.shelfFilter && view.shelfFilter !== 'all' ? [view.shelfFilter] : [],
      platforms: view.platformFilter ? [view.platformFilter] : [],
    };
  }
  const sort = SORT_ORDER.includes(view.sortBy) ? view.sortBy : 'title';
  const state = {
    filter,
    owned: view.ownedFilter === 'true' || view.ownedFilter === 'false' ? view.ownedFilter : 'all',
    sort,
    dir: view.sortDir === 'asc' || view.sortDir === 'desc' ? view.sortDir : DEFAULT_DIR[sort],
    seed: null,
  };
  // A shuffled view gets a fresh shuffle each time it is opened.
  if (sort === 'random') state.seed = newSeed();
  const s = stateToParams(state).toString();
  return s ? `?${s}` : '';
}

/** The comparable form of a search string (seed ignored, param order ignored). */
export function canonicalSearch(search) {
  const params = new URLSearchParams(search || '');
  const state = readLibraryState(params);
  const s = stateToParams({ ...state, seed: null });
  s.sort();
  return s.toString();
}

/** A library link with one more value on `key` — the detail page's genre and tag chips. */
export function librarySearchWith(search, key, value) {
  const params = new URLSearchParams(search || '');
  const { filter } = readLibraryState(params);
  const values = filter[key] || [];
  const next = values.includes(value) ? params : writeLibraryState(params, { [key]: [...values, value] });
  const s = next.toString();
  return s ? `?${s}` : '';
}
