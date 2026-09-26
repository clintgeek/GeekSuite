/**
 * ThingGeek's filter panel and chips, as config for `@geeksuite/collection`
 * (which builds the options from the two `thingFacets` answers, renders the
 * sections and builds the chips).
 *
 * The `context` every label/fixed function gets is
 *   { typesById: Map, nodesById: Map, whereOrder: [id] }
 * from hooks/useThingMeta.js — types and the containment tree are household
 * data, so their names come from the cache, not from the facet answer (which
 * carries ids).
 */
import React from 'react';
import { buildActiveChips } from '@geeksuite/collection';
import { LIBRARY_CODEC, MISSING_VALUES, DUE_VALUES } from './libraryFilter';
import { DUE_LABELS, MISSING_LABELS } from './vocab';
import { KIND_LABELS, shortNodeLabel } from './where';
import { formatMoney } from './money';
import ValueRangeFacet from '../components/ValueRangeFacet';

const DUE_HINTS = { year: 'before Dec 31' };

export function valueLabel(key, value, context = {}) {
  switch (key) {
    case 'types':
      return context.typesById?.get(value)?.name ?? 'Unknown type';
    case 'within': {
      const node = context.nodesById?.get(value);
      return node ? shortNodeLabel(node, context.nodesById) : 'Unknown place';
    }
    case 'kinds':
      return KIND_LABELS[value]?.many ?? value;
    case 'due':
      return DUE_LABELS[value] || value;
    case 'missing':
      return MISSING_LABELS[value] || value;
    default:
      return value;
  }
}

/** "$500 – $2,000", "$500 or more", "Up to $2,000". */
export function valueRangeLabel(min, max) {
  if (min != null && max != null) return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
  if (min != null) return `${formatMoney(min)} or more`;
  return `Up to ${formatMoney(max)}`;
}

const SECTION_DEFS = [
  { id: 'type', title: 'Type', kind: 'list', key: 'types', facet: 'types', limit: 10 },
  {
    // The containment tree's locations and containers, in tree order,
    // labelled with the thing and its parent ("Garage › Van"); a count
    // includes everything inside, at any depth (the server's rule).
    id: 'where',
    title: 'Where',
    kind: 'list',
    key: 'within',
    facet: 'where',
    limit: 10,
    fixed: (context = {}) => context.whereOrder ?? [],
    emptyText: 'Nothing is anywhere yet. Add a house or a garage under Where, then put things in it.',
  },
  { id: 'due', title: 'Due', kind: 'list', key: 'due', facet: 'due', fixed: DUE_VALUES, emptyText: 'Nothing has a date coming up.' },
  {
    id: 'tags',
    title: 'Tags',
    kind: 'grouped',
    key: 'tags',
    facet: 'tags',
    limit: 12,
    itemNoun: { one: 'tag', many: 'tags' },
    emptyText: 'No tags yet. Add a few on any thing — fishing, hunting, shop.',
    match: { key: 'tagMatch', over: ['tags'], text: 'of the chosen tags' },
  },
  {
    // The insurance gaps. A closed vocabulary, so every gap shows (zeros too):
    // "No receipt · 0" is good news worth seeing.
    id: 'missing',
    title: 'Missing',
    kind: 'list',
    key: 'missing',
    facet: 'missing',
    fixed: MISSING_VALUES,
    closedList: true,
  },
  {
    // Locations aren't inventory, so the library leaves them out unless
    // asked: pick Locations here to see the houses, rooms and shelves.
    id: 'kind',
    title: 'Kind',
    kind: 'list',
    key: 'kinds',
    facet: 'kinds',
    fixed: ['container', 'item', 'location'],
    closedList: true,
  },
  {
    id: 'files',
    title: 'Photos & documents',
    kind: 'switch',
    switches: [
      { key: 'hasPhotos', label: 'Has photos', countFacet: 'hasPhotos' },
      { key: 'hasDocuments', label: 'Has documents', countFacet: 'hasDocuments' },
    ],
  },
  {
    id: 'year',
    title: 'Acquired',
    kind: 'range',
    facet: 'acquiredYears',
    bucketKey: 'year',
    minKey: 'acquiredYearMin',
    maxKey: 'acquiredYearMax',
    labels: {
      any: 'Any year',
      empty: 'No acquired dates recorded yet.',
      single: (lo) => `Everything here was acquired in ${lo}.`,
      minAria: 'Acquired no earlier than',
      maxAria: 'Acquired no later than',
    },
  },
  {
    // No value histogram in the facets, so two plain fields (whole dollars).
    id: 'value',
    title: 'Value',
    kind: 'custom',
    render: ({ lib, filter }) => <ValueRangeFacet min={filter.valueMin} max={filter.valueMax} onCommit={(patch) => lib.update(patch)} />,
    activeCount: (filter) => (filter.valueMin != null || filter.valueMax != null ? 1 : 0),
  },
];

export const SECTIONS = SECTION_DEFS.map((s) =>
  s.key ? { ...s, label: (value, context) => valueLabel(s.key, value, context), hint: (value) => (s.key === 'due' ? DUE_HINTS[value] : undefined) } : s
);

export const DEFAULT_OPEN = { type: true, where: true, due: true, tags: true, missing: true, kind: false, files: false, year: false, value: false };

export const SECTIONS_OPEN_KEY = 'thinggeek.filterSections';

const listChip = (key, group) => ({ kind: 'list', key, group, label: (value, context) => valueLabel(key, value, context) });

export const CHIP_SPECS = [
  { kind: 'search', key: 'q', group: 'Search' },
  listChip('types', 'Type'),
  listChip('within', 'In'),
  listChip('kinds', 'Kind'),
  listChip('due', 'Due'),
  listChip('tags', 'Tag'),
  {
    kind: 'custom',
    build: ({ filter: f }) =>
      f.tagMatch === 'all' && f.tags.length > 1
        ? [{ id: 'tagMatch', group: 'Match', label: 'All of them', patch: { tagMatch: 'any' }, modifier: true }]
        : [],
  },
  listChip('missing', 'Missing'),
  { kind: 'boolean', key: 'hasPhotos', group: 'Photos', labels: { true: 'Has some', false: 'None' } },
  { kind: 'boolean', key: 'hasDocuments', group: 'Documents', labels: { true: 'Has some', false: 'None' } },
  { kind: 'range', id: 'year', group: 'Acquired', minKey: 'acquiredYearMin', maxKey: 'acquiredYearMax' },
  { kind: 'range', id: 'value', group: 'Value', minKey: 'valueMin', maxKey: 'valueMax', format: valueRangeLabel },
];

export function activeChips(state, context = {}) {
  return buildActiveChips(LIBRARY_CODEC, state, CHIP_SPECS, context);
}
