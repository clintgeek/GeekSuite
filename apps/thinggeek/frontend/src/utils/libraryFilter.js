/**
 * ThingGeek's library query state: the whole `ThingFilterInput` plus sort,
 * direction and the shuffle seed — described once as a schema for
 * `@geeksuite/collection`'s URL codec, which does the reading, writing and
 * round-tripping. ThingGeek is the collection package's third consumer; what
 * stays here is ThingGeek's: URL keys, vocabularies, sorts and their words.
 *
 * URL grammar — short keys, one per filter, defaults never written:
 *
 *   ?type=<typeId>&type=<typeId>   multi-values are REPEATED params
 *   &tag=fishing&match=all         tagMatch (any is the default)
 *   &in=<thingId>                  within: inside that location or container, at any depth
 *   &kind=location                 kinds (none = containers + items: locations aren't inventory)
 *   &due=overdue&due=30d
 *   &missing=receipt&missing=serial
 *   &photos=1&docs=0               hasPhotos / hasDocuments
 *   &year=2015-2022                acquired year; "2015-" / "-2022" for one side
 *   &value=500-2000                current value, whole dollars
 *   &q=type:boat in:garage         the search box — its tokens are parsed by
 *                                  the SERVER out of q (the plan's grammar)
 *   &sort=value&dir=asc / &sort=random&seed=812
 */
import { createFilterCodec, integerBetween } from '@geeksuite/collection';
import { THING_KINDS } from './where';

export const PAGE_SIZE = 48;

export const DUE_VALUES = ['overdue', '30d', '90d', 'year'];
export const MISSING_VALUES = ['photo', 'id-plate', 'receipt', 'serial', 'value'];

/** Every sort has a resolver case in the gateway (`things(sort:)`). */
export const SORT_ORDER = ['name', 'recentlyAdded', 'acquired', 'value', 'nextDue', 'random'];

export const SORT_LABELS = {
  name: 'Name',
  recentlyAdded: 'Recently added',
  acquired: 'Acquired',
  value: 'Value',
  nextDue: 'Next due',
  random: 'Shuffle',
};

export const SORT_SHORT = {
  name: 'Name',
  recentlyAdded: 'Added',
  acquired: 'Acquired',
  value: 'Value',
  nextDue: 'Due',
  random: 'Shuffle',
};

export const DEFAULT_DIR = {
  name: 'asc',
  recentlyAdded: 'desc',
  acquired: 'desc',
  value: 'desc',
  nextDue: 'asc',
  random: 'asc',
};

export const DIR_LABELS = {
  name: { asc: 'A → Z', desc: 'Z → A' },
  recentlyAdded: { asc: 'Oldest first', desc: 'Newest first' },
  acquired: { asc: 'Longest owned', desc: 'Newest first' },
  value: { asc: 'Lowest first', desc: 'Highest first' },
  nextDue: { asc: 'Soonest first', desc: 'Latest first' },
};

export const SORTS = {
  order: SORT_ORDER,
  default: 'name',
  random: 'random',
  defaultDir: DEFAULT_DIR,
  labels: SORT_LABELS,
  short: SORT_SHORT,
  dirLabels: DIR_LABELS,
};

/** A whole-dollar range side: 0 … a billion, else no limit. */
const dollars = integerBetween(0, 1_000_000_000);

/**
 * The schema. Field order is the URL's param order and the chip order —
 * keep it stable (it is also the scroll-memory key).
 */
export const LIBRARY_CODEC = createFilterCodec({
  fields: [
    { key: 'q', type: 'search', param: 'q' },
    { key: 'types', type: 'list', param: 'type' },
    { key: 'within', type: 'list', param: 'in' },
    { key: 'kinds', type: 'list', param: 'kind', values: THING_KINDS },
    { key: 'due', type: 'list', param: 'due', values: DUE_VALUES },
    { key: 'tags', type: 'list', param: 'tag' },
    { key: 'tagMatch', type: 'enum', param: 'match', values: ['any', 'all'], default: 'any', counts: false, requires: ['tags'] },
    { key: 'missing', type: 'list', param: 'missing', values: MISSING_VALUES },
    { key: 'hasPhotos', type: 'boolean', param: 'photos' },
    { key: 'hasDocuments', type: 'boolean', param: 'docs' },
    { key: 'acquiredYear', type: 'range', param: 'year', minKey: 'acquiredYearMin', maxKey: 'acquiredYearMax', parse: integerBetween(1800, 2199) },
    { key: 'value', type: 'range', param: 'value', minKey: 'valueMin', maxKey: 'valueMax', parse: dollars },
  ],
  sorts: SORTS,
});

export const EMPTY_FILTER = LIBRARY_CODEC.EMPTY_FILTER;
export const DEFAULT_STATE = LIBRARY_CODEC.DEFAULT_STATE;
export const readLibraryState = LIBRARY_CODEC.read;
export const stateToParams = LIBRARY_CODEC.toParams;
export const writeLibraryState = LIBRARY_CODEC.write;
export const toFilterInput = LIBRARY_CODEC.toFilterInput;
export const isNarrowed = LIBRARY_CODEC.isNarrowed;
export const canonicalSearch = LIBRARY_CODEC.canonicalSearch;
export const librarySearchWith = LIBRARY_CODEC.searchWith;

/** Library state → `GetThings` variables. `filter` carries every narrowing; `seed` only for random. */
export function buildThingsVariables(state, page = 1) {
  const sort = SORT_ORDER.includes(state.sort) ? state.sort : 'name';
  const vars = {
    page,
    limit: PAGE_SIZE,
    sort,
    sortDir: sort === 'random' ? 'asc' : state.dir === 'desc' ? 'desc' : 'asc',
  };
  const filter = toFilterInput(state.filter);
  if (filter) vars.filter = filter;
  if (sort === 'random' && state.seed) vars.seed = state.seed;
  return vars;
}

/** The `ThingFilterInput` a query string describes (the insurance report reads the library's). */
export function filterInputFromSearch(search = '') {
  return toFilterInput(readLibraryState(new URLSearchParams(search)).filter);
}

/**
 * The insurance report's filter: the library's, but never locations — a
 * report of houses and shelves means nothing to an adjuster. Asking for
 * locations only falls back to the default (containers + items).
 */
export function reportFilterInputFromSearch(search = '') {
  const filter = filterInputFromSearch(search);
  if (!filter?.kinds) return filter;
  const kinds = filter.kinds.filter((k) => k !== 'location');
  const next = { ...filter };
  if (kinds.length) next.kinds = kinds;
  else delete next.kinds;
  return Object.keys(next).length ? next : null;
}

/** A saved view → the search string that applies it. A shuffled view reshuffles each time. */
export function savedViewSearch(view) {
  if (!view) return '';
  const filter = view.filter && typeof view.filter === 'object' ? view.filter : {};
  return LIBRARY_CODEC.viewSearch({ filter, sort: view.sortBy, dir: view.sortDir });
}

/** A one-filter library link, e.g. `/?missing=receipt` from Needs attention. */
export function libraryLinkWith(key, value) {
  return `/${LIBRARY_CODEC.searchWith('', key, value)}`;
}
