/**
 * GameGeek's filter panel and chips, as config for `@geeksuite/collection`
 * (which builds the options from the two `gameFacets` answers, renders the
 * sections and builds the chips — see its facets/options.js for the
 * base/current rule).
 *
 * What is GameGeek's here: which sections, in the spec's order (§B2), their
 * wording and vocabularies, the tag groups, the cleanup section's
 * "Not installed anymore", and the chip order.
 */
import { buildActiveChips } from '@geeksuite/collection';
import { LIBRARY_CODEC } from './libraryFilter';
import { TAG_GROUP_ORDER, USER_TAG_GROUP, tagGroupOf } from './tagGroups';
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

export const NEEDS_DECISION_LABEL = 'Not installed anymore';

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

function shelfOrder(customShelves = []) {
  return [...BUILT_IN_SHELVES, ...customShelves.map((s) => s.id), 'unshelved'];
}

/** A closed Cleanup section still says when games are waiting on a decision. */
function cleanupCaption(n) {
  return n > 0 ? `${n} not installed anymore` : undefined;
}

/**
 * The sections, in the spec's order (§B2). `facet` is the GameFacets field,
 * `key` the GameFilterInput field. `fixed` lists values in a set order (the
 * rest sort by library count). `limit` is how many show before "Show all".
 * The `context` every label/fixed function gets is `{ customShelves }`.
 */
const SECTION_DEFS = [
  { id: 'shelf', title: 'Shelf', kind: 'list', key: 'shelves', facet: 'shelves', fixed: ({ customShelves } = {}) => shelfOrder(customShelves) },
  { id: 'played', title: 'Played', kind: 'single', key: 'played', facet: 'played', fixed: ['never', 'played', 'recent'] },
  { id: 'store', title: 'Store', kind: 'list', key: 'storefronts', facet: 'storefronts', limit: 8 },
  { id: 'platform', title: 'Platform', kind: 'list', key: 'platforms', facet: 'platforms', limit: 8 },
  { id: 'genre', title: 'Genre', kind: 'list', key: 'genres', facet: 'genres', limit: 10 },
  {
    // Tags: ≈90 canonical plus the household's own — grouped under the
    // vocabulary's headings (Gameplay, Story & mood, Setting, Look & view,
    // then "Your tags"), searchable, top 12 first.
    id: 'tags',
    title: 'Tags',
    kind: 'grouped',
    key: 'tags',
    facet: 'tags',
    limit: 12,
    groupOf: tagGroupOf,
    groupOrder: TAG_GROUP_ORDER,
    groupLabel: (group) => (group === USER_TAG_GROUP ? group : `${group} tags`),
    itemNoun: { one: 'tag', many: 'tags' },
    emptyText: 'No tags yet. They arrive with metadata matches, and your own tags show here too.',
    match: { key: 'tagMatch', over: ['genres', 'tags'], text: 'of the chosen genres & tags' },
  },
  { id: 'modes', title: 'Modes', kind: 'list', key: 'modes', facet: 'modes', fixed: DEFAULT_VOCAB.modes },
  { id: 'length', title: 'Length', kind: 'list', key: 'lengths', facet: 'lengths', fixed: Object.keys(LENGTH_LABELS) },
  {
    id: 'year',
    title: 'Release year',
    kind: 'range',
    facet: 'releaseYears',
    bucketKey: 'year',
    minKey: 'releaseYearMin',
    maxKey: 'releaseYearMax',
    labels: {
      any: 'Any year',
      empty: 'No release years recorded yet.',
      single: (lo) => `Every game here is from ${lo}.`,
      minAria: 'Earliest release year',
      maxAria: 'Latest release year',
    },
  },
  { id: 'format', title: 'Format', kind: 'list', key: 'formats', facet: 'formats', fixed: DEFAULT_VOCAB.copyFormats },
  { id: 'favorites', title: 'Favorites', kind: 'switch', switches: [{ key: 'favorite', label: 'Only favorites', countFacet: 'favorites' }] },
  // The quiet cleanup section: "Not installed anymore" (PLAYNITE_IMPORT.md
  // §Installed → Playing) above the metadata problems. The id stays
  // 'metadata' so a remembered open/closed state survives the rename.
  {
    id: 'metadata',
    title: 'Cleanup',
    kind: 'list',
    key: 'metadata',
    facet: 'metadata',
    fixed: ['no-match', 'ambiguous'],
    closedList: true,
    quiet: true,
    optionsLabel: 'Metadata',
    emptyText: 'Every game is matched.',
    switches: [{ key: 'needsDecision', label: NEEDS_DECISION_LABEL, countFacet: 'needsDecision' }],
    caption: ({ facets }) => cleanupCaption(facets.current?.needsDecision ?? facets.base?.needsDecision),
  },
];

export const SECTIONS = SECTION_DEFS.map((s) =>
  s.key ? { ...s, label: (value, context) => valueLabel(s.key, value, context), hint: (value) => valueHint(s.key, value) } : s
);

/** Sections open until the person closes them. The rest start closed. */
export const DEFAULT_OPEN = { shelf: true, played: true, store: true, platform: true, genre: true, tags: true, length: true, year: true, favorites: true };

/** localStorage key for the remembered open/closed sections. */
export const SECTIONS_OPEN_KEY = 'gamegeek.filterSections';

const listChip = (key, group) => ({ kind: 'list', key, group, label: (value, context) => valueLabel(key, value, context) });

/** The active-filter chips, in panel order. */
export const CHIP_SPECS = [
  { kind: 'search', key: 'q', group: 'Search' },
  listChip('shelves', 'Shelf'),
  { kind: 'single', key: 'played', group: 'Played', label: (v) => PLAYED_LABELS[v] },
  listChip('storefronts', 'Store'),
  listChip('platforms', 'Platform'),
  listChip('genres', 'Genre'),
  listChip('tags', 'Tags'),
  {
    kind: 'custom',
    build: ({ filter: f }) =>
      f.tagMatch === 'all' && f.genres.length + f.tags.length > 1
        ? [{ id: 'tagMatch', group: 'Match', label: 'All of them', patch: { tagMatch: 'any' }, modifier: true }]
        : [],
  },
  listChip('modes', 'Modes'),
  listChip('lengths', 'Length'),
  { kind: 'range', id: 'year', group: 'Released', minKey: 'releaseYearMin', maxKey: 'releaseYearMax' },
  listChip('formats', 'Format'),
  { kind: 'boolean', key: 'favorite', group: 'Favorites', labels: { true: 'Only', false: 'Excluded' } },
  { kind: 'flag', key: 'needsDecision', group: 'Cleanup', label: NEEDS_DECISION_LABEL },
  listChip('metadata', 'Metadata'),
  { kind: 'boolean', key: 'hasCover', group: 'Cover', labels: { true: 'Has one', false: 'Missing' } },
  { kind: 'single', key: 'owned', scope: 'state', group: 'Owned', label: (v) => (v === 'true' ? 'Yes' : 'No') },
];

/**
 * The active-filter chips, in panel order. Each carries the `patch` that
 * removes exactly it, computed against the state it was built from.
 */
export function activeChips(state, { customShelves = [] } = {}) {
  return buildActiveChips(LIBRARY_CODEC, state, CHIP_SPECS, { customShelves });
}
