import { describe, expect, it } from 'vitest';
import { buildFacetOptions, groupOptions, sectionActiveCount, sectionOptions, visibleOptions } from '../facets/options';
import { buildActiveChips, rangeLabel, suggestViewName } from '../facets/chips';
import { BOOK_CODEC, fv } from './fixtures';

const state = (filter = {}, extra = {}) => ({ ...BOOK_CODEC.DEFAULT_STATE, ...extra, filter: { ...BOOK_CODEC.EMPTY_FILTER, ...filter } });

describe('buildFacetOptions', () => {
  it('orders an open vocabulary by the base counts and shows live counts', () => {
    const opts = buildFacetOptions({
      base: fv([['Banks', 3], ['Le Guin', 9], ['Atwood', 3]]),
      current: fv([['Banks', 1], ['Pratchett', 2]]),
      selected: ['Wolfe'],
      label: (v) => v.toUpperCase(),
    });
    // Base order (count desc, then value), then live-only values, then selected extras.
    expect(opts.map((o) => o.value)).toEqual(['Le Guin', 'Atwood', 'Banks', 'Pratchett', 'Wolfe']);
    expect(opts.map((o) => o.count)).toEqual([0, 0, 1, 2, 0]);
    expect(opts[0].label).toBe('LE GUIN');
    expect(opts.find((o) => o.value === 'Wolfe').selected).toBe(true);
  });

  it('count is null while the live answer is not in', () => {
    const opts = buildFacetOptions({ base: fv([['a', 2]]), current: null, selected: ['b'] });
    expect(opts).toEqual([
      { value: 'a', label: 'a', hint: undefined, count: 2, selected: false },
      { value: 'b', label: 'b', hint: undefined, count: null, selected: true },
    ]);
  });

  it('a fixed order hides values nobody has unless chosen; closedList lists exactly it', () => {
    const base = fv([['paper', 4], ['epub', 0], ['audio', 1]]);
    expect(buildFacetOptions({ base, fixed: ['epub', 'pdf', 'paper'], selected: ['pdf'] }).map((o) => o.value)).toEqual(['pdf', 'paper', 'audio']);
    expect(buildFacetOptions({ base, fixed: ['epub', 'pdf'], closedList: true }).map((o) => [o.value, o.count])).toEqual([
      ['epub', 0],
      ['pdf', null],
    ]);
  });

  it('visibleOptions keeps a selected option past the limit', () => {
    const opts = ['a', 'b', 'c', 'd'].map((value, i) => ({ value, selected: i === 3 }));
    expect(visibleOptions(opts, 2, false).map((o) => o.value)).toEqual(['a', 'b', 'd']);
    expect(visibleOptions(opts, 2, true)).toHaveLength(4);
    expect(visibleOptions(opts, undefined, false)).toHaveLength(4);
  });

  it('groupOptions buckets by the app’s groups, drops empty ones, and sends strays to the last', () => {
    const groupOf = (v) => ({ Dune: 'Sci-fi', Emma: 'Classics' })[v] ?? 'Mine';
    const groups = groupOptions([{ value: 'Emma' }, { value: 'Dune' }, { value: 'x' }], (v) => (v === 'x' ? 'Unknown' : groupOf(v)), ['Sci-fi', 'Fantasy', 'Classics', 'Mine']);
    expect(groups.map((g) => [g.group, g.options.map((o) => o.value)])).toEqual([
      ['Sci-fi', ['Dune']],
      ['Classics', ['Emma']],
      ['Mine', ['x']],
    ]);
  });
});

describe('sections', () => {
  const facets = { base: { formats: fv([['epub', 5], ['paper', 2]]) }, current: { formats: fv([['epub', 1]]) } };

  it('sectionOptions resolves fixed/label/hint against the app context', () => {
    const section = {
      kind: 'list',
      key: 'shelves',
      facet: 'shelves',
      fixed: (ctx) => ['to-read', ...ctx.custom],
      label: (v, ctx) => ctx.names[v] ?? v,
      hint: (v) => (v === 'to-read' ? 'someday' : undefined),
    };
    const opts = sectionOptions(section, {
      facets: { base: { shelves: fv([['to-read', 3], ['loans', 1]]) } },
      filter: BOOK_CODEC.EMPTY_FILTER,
      context: { custom: ['loans'], names: { loans: 'Lent out' } },
    });
    expect(opts.map((o) => [o.label, o.hint])).toEqual([
      ['to-read', 'someday'],
      ['Lent out', undefined],
    ]);
    expect(sectionOptions({ kind: 'list', key: 'formats', facet: 'formats' }, { facets, filter: state({ formats: ['pdf'] }).filter }).map((o) => o.value)).toEqual([
      'epub',
      'paper',
      'pdf',
    ]);
  });

  it('sectionActiveCount per kind, switches included', () => {
    const f = state({ formats: ['epub', 'pdf'], owned: false, hasFile: true, readYearMin: 2001 }).filter;
    expect(sectionActiveCount({ kind: 'list', key: 'formats', switches: [{ key: 'hasFile' }] }, f)).toBe(3);
    expect(sectionActiveCount({ kind: 'range', minKey: 'readYearMin', maxKey: 'readYearMax' }, f)).toBe(1);
    // A switch section counts a set key either way; `on` decides a companion switch.
    expect(sectionActiveCount({ kind: 'switch', switches: [{ key: 'owned' }] }, f)).toBe(1);
    expect(sectionActiveCount({ kind: 'single', key: 'tagMatch' }, f)).toBe(1);
    expect(sectionActiveCount({ kind: 'custom', activeCount: () => 7 }, f)).toBe(7);
  });
});

describe('buildActiveChips', () => {
  const SPECS = [
    { kind: 'search', key: 'q' },
    { kind: 'list', key: 'authors', group: 'Author' },
    { kind: 'list', key: 'formats', group: 'Format', label: (v, ctx) => ctx.formatNames[v] },
    { kind: 'custom', build: ({ filter }) => (filter.tagMatch === 'all' ? [{ id: 'match', group: 'Match', label: 'All', patch: { tagMatch: 'any' }, modifier: true }] : []) },
    { kind: 'boolean', key: 'owned', group: 'Owned', labels: { true: 'Yes', false: 'No' } },
    { kind: 'flag', key: 'hasFile', group: 'File', label: 'Has a file' },
    { kind: 'range', id: 'read', minKey: 'readYearMin', maxKey: 'readYearMax', group: 'Read' },
    { kind: 'range', id: 'stars', minKey: 'ratingMin', maxKey: 'ratingMax', group: 'Rating', format: (a, b) => `${a ?? 1}–${b ?? 5}★` },
    { kind: 'single', key: 'view', scope: 'state', group: 'View', label: () => 'Compact' },
  ];
  const ctx = { formatNames: { epub: 'EPUB' } };

  it('builds chips in spec order, each with the patch that removes exactly it', () => {
    const s = BOOK_CODEC.read(new URLSearchParams('?q=dune&author=A&author=B&format=epub&match=all&tag=x&owned=0&file=1&read=2010-&stars=4-&v=compact'));
    const chips = buildActiveChips(BOOK_CODEC, s, SPECS, ctx);
    expect(chips.map((c) => `${c.group}:${c.label}`)).toEqual([
      'Search:“dune”',
      'Author:A',
      'Author:B',
      'Format:EPUB',
      'Match:All',
      'Owned:No',
      'File:Has a file',
      'Read:2010 or later',
      'Rating:4–5★',
      'View:Compact',
    ]);
    const byId = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(byId['authors:A'].patch).toEqual({ authors: ['B'] });
    expect(byId.read.patch).toEqual({ readYearMin: null, readYearMax: null });
    expect(byId.view.patch).toEqual({ view: 'full' });
    expect(byId.q.patch).toEqual({ q: '' });
    // Applying a patch through the codec removes just that chip.
    const after = BOOK_CODEC.read(BOOK_CODEC.write(new URLSearchParams(BOOK_CODEC.toParams(s)), byId['authors:A'].patch));
    expect(after.filter.authors).toEqual(['B']);
    expect(after.filter.formats).toEqual(['epub']);
  });

  it('nothing narrowing, no chips', () => {
    expect(buildActiveChips(BOOK_CODEC, state(), SPECS, ctx)).toEqual([]);
  });

  it('rangeLabel words every shape', () => {
    expect(rangeLabel(2010, 2020)).toBe('2010–2020');
    expect(rangeLabel(2010, 2010)).toBe('2010');
    expect(rangeLabel(2010, null)).toBe('2010 or later');
    expect(rangeLabel(null, 2020)).toBe('Up to 2020');
  });

  it('suggestViewName skips the search and modifiers, falls back when empty', () => {
    const s = BOOK_CODEC.read(new URLSearchParams('?q=dune&match=all&tag=x&author=A&author=B&format=epub&file=1'));
    const chips = buildActiveChips(BOOK_CODEC, s, SPECS, ctx);
    expect(suggestViewName(chips, 'Title')).toBe('A · B · EPUB');
    expect(suggestViewName([], 'Title')).toBe('Title');
  });
});
