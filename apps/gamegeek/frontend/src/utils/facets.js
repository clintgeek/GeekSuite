/**
 * The filter panel's sections, and how a facet's server counts become the
 * options a person sees.
 *
 * Two `gameFacets` answers feed every list:
 *   - `base`: the unfiltered library. It fixes the ORDER (most common first)
 *     and the universe of values, so options do not reshuffle or vanish as
 *     the counts move under other filters — no layout shift, and an option
 *     that would give zero stays on screen, dimmed.
 *   - `current`: the live counts under the active filter (each facet
 *     excluding its own selections — that is the server's rule, §B1).
 * A selected value is always present, even if neither answer lists it.
 */
import { BUILT_IN_SHELVES, DEFAULT_VOCAB, formatLabel, modeLabel, platformLabel, shelfLabel, storefrontLabel } from './vocab';

export const LENGTH_LABELS = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  epic: 'Epic',
  unknown: 'Unknown',
};

export const LENGTH_HINTS = {
  short: 'under 5 h',
  medium: '5–15 h',
  long: '15–40 h',
  epic: '40 h+',
  unknown: 'no time-to-beat',
};

export const PLAYED_LABELS = { never: 'Never played', played: 'Played', recent: 'Recently' };
export const PLAYED_HINTS = { recent: 'last 30 days' };

export const METADATA_LABELS = {
  'no-match': 'No match',
  ambiguous: 'Needs a choice',
  matched: 'Matched',
  pending: 'Looking up',
  error: 'Lookup failed',
  unlinked: 'Unlinked',
};

/**
 * The sections, in the spec's order (§B2). `facet` is the GameFacets field,
 * `key` the GameFilterInput field. `fixed` lists values in a set order (the
 * rest sort by library count). `limit` is how many show before "Show all".
 */
export const SECTIONS = [
  { id: 'shelf', title: 'Shelf', kind: 'list', key: 'shelves', facet: 'shelves', fixed: 'shelves' },
  { id: 'played', title: 'Played', kind: 'single', key: 'played', facet: 'played', fixed: ['never', 'played', 'recent'] },
  { id: 'store', title: 'Store', kind: 'list', key: 'storefronts', facet: 'storefronts', limit: 8 },
  { id: 'platform', title: 'Platform', kind: 'list', key: 'platforms', facet: 'platforms', limit: 8 },
  { id: 'genre', title: 'Genre', kind: 'list', key: 'genres', facet: 'genres', limit: 10 },
  { id: 'tags', title: 'Tags', kind: 'tags', key: 'tags', facet: 'tags', limit: 12 },
  { id: 'modes', title: 'Modes', kind: 'list', key: 'modes', facet: 'modes', fixed: DEFAULT_VOCAB.modes },
  { id: 'length', title: 'Length', kind: 'list', key: 'lengths', facet: 'lengths', fixed: Object.keys(LENGTH_LABELS) },
  { id: 'year', title: 'Release year', kind: 'year' },
  { id: 'format', title: 'Format', kind: 'list', key: 'formats', facet: 'formats', fixed: DEFAULT_VOCAB.copyFormats },
  { id: 'favorites', title: 'Favorites', kind: 'switch' },
  // The quiet cleanup section: "Not installed anymore" (PLAYNITE_IMPORT.md
  // §Installed → Playing) above the metadata problems. The id stays
  // 'metadata' so a remembered open/closed state survives the rename.
  { id: 'metadata', title: 'Cleanup', kind: 'cleanup', key: 'metadata', facet: 'metadata', fixed: ['no-match', 'ambiguous'], closedList: true, quiet: true },
];

export const NEEDS_DECISION_LABEL = 'Not installed anymore';

/** Sections open until the person closes them. The rest start closed. */
export const DEFAULT_OPEN = { shelf: true, played: true, store: true, platform: true, genre: true, tags: true, length: true, year: true, favorites: true };

/** Human label for a value in a filter key. */
export function valueLabel(key, value, { customShelves = [] } = {}) {
  switch (key) {
    case 'shelves':
      return shelfLabel(value, customShelves);
    case 'storefronts':
      return storefrontLabel(value);
    case 'platforms':
      return platformLabel(value);
    case 'formats':
      return value === 'subscription' ? 'Game Pass / subscription' : formatLabel(value);
    case 'modes':
      return modeLabel(value);
    case 'lengths':
      return LENGTH_LABELS[value] || value;
    case 'played':
      return PLAYED_LABELS[value] || value;
    case 'metadata':
      return METADATA_LABELS[value] || value;
    default:
      return value;
  }
}

export function valueHint(key, value) {
  if (key === 'lengths') return LENGTH_HINTS[value];
  if (key === 'played') return PLAYED_HINTS[value];
  return undefined;
}

function shelfOrder(customShelves) {
  return [...BUILT_IN_SHELVES, ...customShelves.map((s) => s.id), 'unshelved'];
}

/**
 * Build a section's options.
 *   base/current: `[{ value, count }]` from the two facet answers (either may be missing).
 *   selected: the values currently chosen for this key.
 * Returns `[{ value, label, hint, count, selected }]`, where `count` is null
 * while the live answer is not in yet (the row keeps its last width).
 */
export function buildOptions(section, { base, current, selected = [], customShelves = [] }) {
  const baseMap = new Map((base || []).map((v) => [v.value, v.count]));
  const curMap = current ? new Map(current.map((v) => [v.value, v.count])) : null;

  let values;
  if (section.fixed) {
    const fixed = section.fixed === 'shelves' ? shelfOrder(customShelves) : section.fixed;
    if (section.closedList) {
      values = [...fixed];
    } else {
      // A fixed order still hides a value nobody in the library has (an empty
      // shelf), unless it is chosen; unknown extras from the server go last.
      const known = [...fixed, ...[...baseMap.keys()].filter((v) => !fixed.includes(v))];
      values = known.filter((v) => (baseMap.get(v) ?? 0) > 0 || (curMap?.get(v) ?? 0) > 0 || selected.includes(v));
    }
  } else {
    values = [...baseMap.keys()].sort((a, b) => baseMap.get(b) - baseMap.get(a) || String(a).localeCompare(String(b)));
    for (const v of curMap?.keys() ?? []) if (!baseMap.has(v)) values.push(v);
  }
  for (const v of selected) if (!values.includes(v)) values.push(v);

  return values.map((value) => ({
    value,
    label: valueLabel(section.key, value, { customShelves }),
    hint: valueHint(section.key, value),
    count: curMap ? curMap.get(value) ?? 0 : baseMap.has(value) ? baseMap.get(value) : null,
    selected: selected.includes(value),
  }));
}

/**
 * The options that show before "Show all": the first `limit`, plus any
 * selected ones further down (a selected option never hides).
 */
export function visibleOptions(options, limit, expanded) {
  if (expanded || !limit || options.length <= limit) return options;
  const head = options.slice(0, limit);
  const tail = options.slice(limit).filter((o) => o.selected);
  return [...head, ...tail];
}

const GROUP_TITLE = Object.fromEntries(SECTIONS.filter((s) => s.key).map((s) => [s.key, s.title]));
GROUP_TITLE.shelves = 'Shelf';
GROUP_TITLE.metadata = 'Metadata';

function yearLabel(min, max) {
  if (min != null && max != null) return min === max ? String(min) : `${min}–${max}`;
  if (min != null) return `${min} or later`;
  return `Up to ${max}`;
}

/**
 * The active-filter chips, in panel order. Each carries the `patch` that
 * removes exactly it, computed against the state it was built from.
 */
export function activeChips(state, { customShelves = [] } = {}) {
  const f = state.filter;
  const chips = [];
  const q = (f.q || '').trim();
  if (q) chips.push({ id: 'q', group: 'Search', label: `“${q}”`, patch: { q: '' } });

  const list = (key) =>
    (f[key] || []).forEach((value) =>
      chips.push({
        id: `${key}:${value}`,
        group: GROUP_TITLE[key],
        label: valueLabel(key, value, { customShelves }),
        patch: { [key]: f[key].filter((v) => v !== value) },
      })
    );

  list('shelves');
  if (f.played) chips.push({ id: 'played', group: 'Played', label: PLAYED_LABELS[f.played], patch: { played: '' } });
  ['storefronts', 'platforms', 'genres', 'tags'].forEach(list);
  if (f.tagMatch === 'all' && (f.genres.length + f.tags.length) > 1) {
    chips.push({ id: 'tagMatch', group: 'Match', label: 'All of them', patch: { tagMatch: 'any' } });
  }
  ['modes', 'lengths'].forEach(list);
  if (f.releaseYearMin != null || f.releaseYearMax != null) {
    chips.push({ id: 'year', group: 'Released', label: yearLabel(f.releaseYearMin, f.releaseYearMax), patch: { releaseYearMin: null, releaseYearMax: null } });
  }
  list('formats');
  if (f.favorite !== null) chips.push({ id: 'favorite', group: 'Favorites', label: f.favorite ? 'Only' : 'Excluded', patch: { favorite: null } });
  if (f.needsDecision === true) {
    chips.push({ id: 'needsDecision', group: 'Cleanup', label: NEEDS_DECISION_LABEL, patch: { needsDecision: null } });
  }
  list('metadata');
  if (f.hasCover !== null) chips.push({ id: 'hasCover', group: 'Cover', label: f.hasCover ? 'Has one' : 'Missing', patch: { hasCover: null } });
  if (state.owned === 'true' || state.owned === 'false') {
    chips.push({ id: 'owned', group: 'Owned', label: state.owned === 'true' ? 'Yes' : 'No', patch: { owned: 'all' } });
  }
  return chips;
}
