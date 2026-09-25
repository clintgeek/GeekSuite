/**
 * The library's query state, and the one function that turns it into
 * `games(...)` variables.
 *
 * All of it lives in the URL (`/?shelf=backlog&sort=hoursPlayed&dir=desc`) so
 * a filtered library is a link, back works, and the detail sheet at
 * `/game/:id?…` closes onto exactly the library it opened from.
 *
 * Every sort here has a resolver case in the gateway
 * (typeDefs: title | dateAdded | releaseDate | rating | lastPlayed | hoursPlayed).
 */
export const PAGE_SIZE = 48;

export const SORT_ORDER = ['title', 'dateAdded', 'releaseDate', 'rating', 'lastPlayed', 'hoursPlayed'];

export const SORT_LABELS = {
  title: 'Title',
  dateAdded: 'Date added',
  releaseDate: 'Release date',
  rating: 'My rating',
  lastPlayed: 'Last played',
  hoursPlayed: 'Hours played',
};

/** The direction a sort starts in: A→Z for names, newest/most first for the rest. */
export const DEFAULT_DIR = {
  title: 'asc',
  dateAdded: 'desc',
  releaseDate: 'desc',
  rating: 'desc',
  lastPlayed: 'desc',
  hoursPlayed: 'desc',
};

export const OWNED_OPTIONS = [
  { id: 'all', label: 'Everything' },
  { id: 'true', label: 'Owned' },
  { id: 'false', label: 'Not owned' },
];

export const DEFAULT_LIBRARY = Object.freeze({
  shelf: 'all',
  q: '',
  sort: 'title',
  dir: 'asc',
  platform: '',
  owned: 'all',
});

/** URLSearchParams → library state, with anything unknown falling back to the default. */
export function readLibraryParams(params) {
  const get = (k) => params.get(k) ?? '';
  const sort = SORT_ORDER.includes(get('sort')) ? get('sort') : DEFAULT_LIBRARY.sort;
  const dir = get('dir') === 'asc' || get('dir') === 'desc' ? get('dir') : DEFAULT_DIR[sort];
  const owned = ['true', 'false'].includes(get('owned')) ? get('owned') : 'all';
  return {
    shelf: get('shelf') || 'all',
    q: get('q'),
    sort,
    dir,
    platform: get('platform'),
    owned,
  };
}

/**
 * A patch applied to the current params. Defaults are removed rather than
 * written, so the plain library is plain `/`.
 */
export function writeLibraryParams(params, patch) {
  const next = new URLSearchParams(params);
  const merged = { ...readLibraryParams(params), ...patch };
  if (patch.sort && !patch.dir) merged.dir = DEFAULT_DIR[patch.sort];
  const set = (key, value, dflt) => {
    if (!value || value === dflt) next.delete(key);
    else next.set(key, value);
  };
  set('shelf', merged.shelf, 'all');
  set('q', merged.q.trim() ? merged.q : '', '');
  set('sort', merged.sort, DEFAULT_LIBRARY.sort);
  set('dir', merged.dir, DEFAULT_DIR[merged.sort]);
  set('platform', merged.platform, '');
  set('owned', merged.owned, 'all');
  return next;
}

/** Library state → `GetGames` variables. Only what narrows is sent. */
export function buildGamesVariables(state, page = 1) {
  const vars = {
    page,
    limit: PAGE_SIZE,
    sort: SORT_ORDER.includes(state.sort) ? state.sort : 'title',
    sortDir: state.dir === 'desc' ? 'desc' : 'asc',
  };
  const q = (state.q || '').trim();
  if (q) vars.q = q;
  if (state.shelf && state.shelf !== 'all') vars.shelf = state.shelf;
  if (state.platform) vars.platform = state.platform;
  if (state.owned === 'true' || state.owned === 'false') vars.owned = state.owned;
  return vars;
}

/** How many narrowing filters (not sort, not shelf — those have their own UI) are on. */
export function activeFilterCount(state) {
  return (state.platform ? 1 : 0) + (state.owned !== 'all' ? 1 : 0);
}
