/**
 * The phone's Filters sheet: what is on sits at the top, and with a filter
 * on, options that would show nothing are left out — taken as the sheet
 * opens, never growing while it is open.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import ThingFiltersSheet, { emptyOptions, withoutOptions } from '../../components/ThingFiltersSheet';
import { LIBRARY_CODEC } from '../../utils/libraryFilter';
import { SECTIONS, activeChips } from '../../utils/facets';
import { TYPES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const opt = (value, count) => ({ __typename: 'ThingFacetValue', value, count });
const answer = (types, tags) => ({ __typename: 'ThingFacets', total: 4, types, tags, where: [], kinds: [], due: [], missing: [], acquiredYears: [], hasPhotos: 0, hasDocuments: 0 });

const base = answer([opt('ty-tool', 6), opt('ty-camera', 3), opt('ty-boat', 2)], [opt('fishing', 4), opt('shop', 5)]);
const current = answer([opt('ty-boat', 2), opt('ty-tool', 0), opt('ty-camera', 0)], [opt('fishing', 4), opt('shop', 0)]);

const context = { typesById: new Map(TYPES.map((t) => [t.id, t])), nodesById: new Map(), whereOrder: [] };

function lib(filter = {}) {
  const state = LIBRARY_CODEC.read(new URLSearchParams());
  const next = { ...state, filter: { ...state.filter, ...filter } };
  return { state: next, activeCount: LIBRARY_CODEC.activeCount(next), update: vi.fn(), toggle: vi.fn(), clearAll: vi.fn() };
}

describe('which options would show nothing', () => {
  it('a value the household has, counted zero under the filter', () => {
    const empty = emptyOptions({ base, current });
    expect([...empty.types].sort()).toEqual(['ty-camera', 'ty-tool']);
    expect([...empty.tags]).toEqual(['shop']);
    // With nothing narrowing, current IS base: nothing is empty.
    expect(emptyOptions({ base, current: base })).toEqual({});
  });

  it('taking them out keeps a chosen one', () => {
    const shown = withoutOptions({ base, current }, { tags: new Set(['shop']) }, (k, v) => k === 'tags' && v === 'shop');
    expect(shown.base.tags.map((o) => o.value)).toEqual(['fishing', 'shop']);
  });
});

describe('the sheet', () => {
  it('shows what is on first, and leaves out options that would show nothing', () => {
    const l = lib({ tags: ['fishing'] });
    renderWithProviders(
      <ThingFiltersSheet open onClose={() => {}} sections={SECTIONS} lib={l} facets={{ base, current }} context={context} sectionsOpen={{ type: true, tags: true }} onToggleSection={() => {}} total={4} chips={activeChips(l.state, context)} />
    );
    const on = screen.getByTestId('filters-sheet-on');
    expect(within(on).getByRole('button', { name: 'Remove Tag: fishing' })).toBeInTheDocument();
    expect(on).toHaveTextContent('3 options that would show nothing are left out.');
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByText('Tool')).toBeNull();
    expect(within(sheet).queryByText('Camera')).toBeNull();
    expect(within(sheet).getByText('Boat')).toBeInTheDocument();
    // The on-now strip comes before the first section.
    const firstSection = within(sheet).getAllByRole('button', { expanded: true })[0];
    expect(on.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nothing on: every option, no strip', () => {
    const l = lib();
    renderWithProviders(
      <ThingFiltersSheet open onClose={() => {}} sections={SECTIONS} lib={l} facets={{ base, current: base }} context={context} sectionsOpen={{ type: true }} onToggleSection={() => {}} total={11} chips={[]} />
    );
    expect(screen.queryByTestId('filters-sheet-on')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('Tool')).toBeInTheDocument();
  });
});
