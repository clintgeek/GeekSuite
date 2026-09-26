import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import FilterSections from '../ui/FilterSections';
import FilterPanel from '../ui/FilterPanel';
import { BOOK_CODEC, fv } from './fixtures';
import { renderUi } from './testUtils';

const GROUPS = { Dune: 'Sci-fi', Foundation: 'Sci-fi', Emma: 'Classics' };

const SECTIONS = [
  { id: 'shelf', title: 'Shelf', kind: 'list', key: 'shelves', facet: 'shelves', fixed: (ctx) => ['to-read', 'reading', ...ctx.custom], label: (v) => ({ 'to-read': 'To read' })[v] ?? v },
  { id: 'format', title: 'Format', kind: 'single', key: 'tagMatch', facet: 'unused', fixed: ['all'] },
  {
    id: 'tags',
    title: 'Tags',
    kind: 'grouped',
    key: 'tags',
    facet: 'tags',
    limit: 2,
    groupOf: (v) => GROUPS[v] ?? 'Mine',
    groupOrder: ['Sci-fi', 'Classics', 'Mine'],
    groupLabel: (g) => `${g} shelf`,
    itemNoun: { one: 'tag', many: 'tags' },
    match: { key: 'tagMatch', over: ['tags'], text: 'of the chosen tags' },
  },
  { id: 'read', title: 'Read in', kind: 'range', facet: 'readYears', minKey: 'readYearMin', maxKey: 'readYearMax', labels: { any: 'Any year', minAria: 'From', maxAria: 'To' } },
  { id: 'owned', title: 'Owned', kind: 'switch', switches: [{ key: 'owned', label: 'Only books I own', countFacet: 'owned' }] },
  { id: 'files', title: 'Files', kind: 'list', key: 'formats', facet: 'formats', quiet: true, switches: [{ key: 'hasFile', label: 'Has a file', countFacet: 'withFile' }], caption: ({ facets }) => `${facets.base.withFile} with files` },
  { id: 'extra', title: 'Extra', kind: 'custom', render: ({ filter }) => <p data-testid="custom">custom {filter.q}</p>, activeCount: () => 2 },
];

const BASE = {
  total: 40,
  shelves: fv([['to-read', 20], ['reading', 0], ['loans', 3]]),
  tags: fv([['Dune', 9], ['Emma', 4], ['Foundation', 2], ['Homebrew', 1]]),
  readYears: [{ value: 2019, count: 3 }, { value: 2020, count: 5 }, { value: 2022, count: 1 }],
  formats: fv([['epub', 30], ['paper', 10]]),
  owned: 12,
  withFile: 31,
};

const lib = (filter = {}) => ({ state: { ...BOOK_CODEC.DEFAULT_STATE, filter: { ...BOOK_CODEC.EMPTY_FILTER, ...filter } }, toggle: vi.fn(), update: vi.fn(), activeCount: 0, clearAll: vi.fn() });
const allOpen = Object.fromEntries(SECTIONS.map((s) => [s.id, true]));
const renderSections = (l, props = {}) =>
  renderUi(<FilterSections sections={SECTIONS} lib={l} facets={{ base: BASE, current: BASE }} context={{ custom: ['loans'] }} open={allOpen} onToggleSection={() => {}} {...props} />);

describe('FilterSections (books config)', () => {
  it('renders sections in config order with the app’s noun in every count', () => {
    renderSections(lib());
    expect(screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Shelf', 'Tags', 'Read in', 'Owned', 'Files31 with files', 'Extra2 selected'])
    );
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    // Fixed order from context; a fixed value nobody has ("reading") hides.
    expect(within(shelf).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['To read, 20 books', 'loans, 3 books']);
    expect(screen.getByRole('checkbox', { name: 'Only books I own, 12 books' })).toBeInTheDocument();
  });

  it('list checkboxes toggle; single radios update with Any first', () => {
    const l = lib({ tagMatch: 'all' });
    renderSections(l);
    fireEvent.click(screen.getByRole('checkbox', { name: 'To read, 20 books' }));
    expect(l.toggle).toHaveBeenCalledWith('shelves', 'to-read');
    const single = screen.getByRole('group', { name: 'Format' });
    expect(within(single).getByRole('radio', { name: /^all/ })).toBeChecked();
    fireEvent.click(within(single).getByRole('radio', { name: 'Any, 40 books' }));
    expect(l.update).toHaveBeenCalledWith({ tagMatch: '' });
  });

  it('grouped options: groups from config, search, show all, and the Any/All toggle', () => {
    const l = lib({ tags: ['Dune', 'Homebrew'] });
    renderSections(l);
    expect(screen.getByRole('group', { name: 'Sci-fi shelf' })).toHaveTextContent('Dune');
    // Limit 2 plus the selected Homebrew; Foundation waits behind "Show all".
    expect(screen.getByRole('group', { name: 'Mine shelf' })).toHaveTextContent('Homebrew');
    expect(screen.queryByRole('checkbox', { name: /Foundation/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 tags' }));
    expect(screen.getByRole('checkbox', { name: /Foundation/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), { target: { value: 'emm' } });
    expect(screen.getByRole('checkbox', { name: /Emma/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Foundation/ })).toBeNull();
    // A selected value never hides, search or not.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), { target: { value: 'zzz' } });
    expect(screen.getByRole('checkbox', { name: /Dune/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Emma/ })).toBeNull();
    // Two tags chosen → the match toggle shows, in the app's words.
    expect(screen.getByText('of the chosen tags')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(l.update).toHaveBeenCalledWith({ tagMatch: 'all' });
  });

  it('collapsedGroups: a folded heading sits last, outside the limit, and opens whole', () => {
    // Unset, "Mine" is an ordinary group (the test above); folded, Homebrew
    // leaves the top-2 pool and "Show all" counts only the unfolded three.
    const folded = SECTIONS.map((s) => (s.id === 'tags' ? { ...s, collapsedGroups: ['Mine'] } : s));
    const l = lib();
    renderSections(l, { sections: folded });
    const toggle = screen.getByRole('button', { name: 'Mine, 1 tag' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /Homebrew/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show all 3 tags' })).toBeInTheDocument();
    // Folded rows come after "Show all".
    expect(screen.getByRole('button', { name: 'Show all 3 tags' }).compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('group', { name: 'Mine shelf' })).getByRole('checkbox', { name: /Homebrew/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Homebrew/ }));
    expect(l.toggle).toHaveBeenCalledWith('tags', 'Homebrew');
  });

  it('collapsedGroups: a selected value shows while folded, and a search looks inside', () => {
    const folded = SECTIONS.map((s) => (s.id === 'tags' ? { ...s, collapsedGroups: ['Mine'] } : s));
    renderSections(lib({ tags: ['Homebrew'] }), { sections: folded });
    expect(screen.getByRole('button', { name: 'Mine, 1 tag' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('checkbox', { name: /Homebrew/ })).toBeChecked();
    cleanup();
    renderSections(lib(), { sections: folded });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), { target: { value: 'home' } });
    expect(screen.getByRole('checkbox', { name: /Homebrew/ })).toBeInTheDocument();
  });

  it('a search that matches nothing says so, in the app’s noun', () => {
    renderSections(lib());
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tags' }), { target: { value: 'zzz' } });
    expect(document.body.textContent).toContain('No tag matches “zzz”.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear tag search' }));
    expect(screen.getByRole('checkbox', { name: /Dune/ })).toBeInTheDocument();
  });

  it('switches write their on value or null; a list section can carry one', () => {
    const l = lib({ hasFile: true });
    renderSections(l);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only books I own, 12 books' }));
    expect(l.update).toHaveBeenCalledWith({ owned: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Has a file, 31 books' }));
    expect(l.update).toHaveBeenCalledWith({ hasFile: null });
    expect(screen.getByRole('button', { name: /^Files/ })).toHaveTextContent('1 selected');
  });

  it('range: histogram slider with the app’s labels; custom renders its own body', () => {
    renderSections(lib({ q: 'dune' }));
    expect(screen.getByText('Any year')).toBeInTheDocument();
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['From', 'To']);
    expect(screen.getByTestId('custom')).toHaveTextContent('custom dune');
  });

  it('a closed section still says how many values are on, and its heading toggles', () => {
    const onToggle = vi.fn();
    renderSections(lib({ shelves: ['to-read', 'loans'] }), { open: {}, onToggleSection: onToggle });
    const shelf = screen.getByRole('button', { name: /^Shelf/ });
    expect(shelf).toHaveAttribute('aria-expanded', 'false');
    expect(shelf).toHaveTextContent('2 selected');
    fireEvent.click(shelf);
    expect(onToggle).toHaveBeenCalledWith('shelf');
  });
});

describe('FilterPanel', () => {
  it('titles itself, offers Clear all only when narrowing, and hides', () => {
    const onHide = vi.fn();
    const l = { ...lib(), activeCount: 2 };
    renderUi(<FilterPanel sections={SECTIONS} lib={l} facets={{ base: BASE, current: BASE }} context={{ custom: [] }} open={{}} onToggleSection={() => {}} onHide={onHide} />);
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(l.clearAll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(onHide).toHaveBeenCalled();
  });
});
