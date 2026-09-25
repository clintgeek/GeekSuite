import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import ActiveChips from '../../../components/filters/ActiveChips';
import FiltersSheet from '../../../components/filters/FiltersSheet';
import LibraryHeader from '../../../components/filters/LibraryHeader';
import SaveViewDialog from '../../../components/filters/SaveViewDialog';
import { SAVE_GAME_FILTER } from '../../../graphql/mutations';
import { activeChips } from '../../../utils/facets';
import { DEFAULT_STATE, EMPTY_FILTER, readLibraryState, writeLibraryState } from '../../../utils/libraryFilter';
import { renderWithProviders } from '../../testUtils';

const stateOf = (filter, extra = {}) => ({ ...DEFAULT_STATE, ...extra, filter: { ...EMPTY_FILTER, ...filter } });

describe('active-filter chips', () => {
  it('one chip per value; removing one drops just that value from the URL', () => {
    let params = new URLSearchParams('?genre=RPG&genre=Puzzle&store=steam&year=2010-&q=zelda');
    const state = readLibraryState(params);
    const chips = activeChips(state);
    const onRemove = vi.fn((c) => {
      params = writeLibraryState(params, c.patch);
    });
    renderWithProviders(<ActiveChips chips={chips} onRemove={onRemove} onClearAll={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Genre: RPG' }));
    expect(params.getAll('genre')).toEqual(['Puzzle']);
    expect(params.get('store')).toBe('steam');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Released: 2010 or later' }));
    expect(params.get('year')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Search: “zelda”' }));
    expect(params.get('q')).toBeNull();
  });

  it('Clear all calls through', () => {
    const onClearAll = vi.fn();
    renderWithProviders(<ActiveChips chips={activeChips(stateOf({ tags: ['Cozy'] }))} onRemove={() => {}} onClearAll={onClearAll} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('nothing active renders nothing', () => {
    const { container } = renderWithProviders(<ActiveChips chips={[]} onRemove={() => {}} onClearAll={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LibraryHeader', () => {
  const lib = (filter = {}, extra = {}) => {
    const state = stateOf(filter, extra);
    return { state, activeCount: 1, update: vi.fn(), clearAll: vi.fn(), setSort: vi.fn(), reshuffle: vi.fn() };
  };

  it('announces the result count politely', () => {
    renderWithProviders(<LibraryHeader isDesktop total={124} lib={lib()} chips={[]} panelOpen onSave={() => {}} view="grid" onToggleView={() => {}} />);
    const count = screen.getByTestId('result-count');
    expect(count).toHaveTextContent('124 games');
    expect(count).toHaveAttribute('aria-live', 'polite');
  });

  it('the phone header shows "Filters · N" and opens the sheet', () => {
    const onOpenSheet = vi.fn();
    renderWithProviders(
      <LibraryHeader isDesktop={false} total={3} lib={lib({ genres: ['RPG'] })} chips={[]} onOpenSheet={onOpenSheet} onSave={() => {}} view="grid" onToggleView={() => {}} />
    );
    const btn = screen.getByRole('button', { name: 'Filters, 1 active' });
    expect(btn).toHaveTextContent('Filters· 1');
    fireEvent.click(btn);
    expect(onOpenSheet).toHaveBeenCalled();
  });

  it('the sort menu offers length and shuffle, with direction in words', () => {
    const l = lib();
    renderWithProviders(<LibraryHeader isDesktop total={3} lib={l} chips={[]} panelOpen onSave={() => {}} view="grid" onToggleView={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Title, A → Z' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Length' }));
    expect(l.setSort).toHaveBeenCalledWith('timeToBeat');
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Title, A → Z' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Z → A' }));
    expect(l.setSort).toHaveBeenCalledWith('title', 'desc');
  });
});

describe('FiltersSheet', () => {
  it('its footer says how many games the filter shows, and closes', () => {
    const onClose = vi.fn();
    const lib = { state: stateOf({ genres: ['RPG'] }), activeCount: 1, toggle: vi.fn(), update: vi.fn(), clearAll: vi.fn() };
    renderWithProviders(
      <FiltersSheet open onClose={onClose} lib={lib} facets={{ base: null, current: null }} sectionsOpen={{}} onToggleSection={() => {}} total={124} />
    );
    const show = screen.getByTestId('filters-sheet-show');
    expect(show).toHaveTextContent('Show 124 games');
    fireEvent.click(show);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes it', () => {
    const onClose = vi.fn();
    const lib = { state: stateOf({}), activeCount: 0, toggle: vi.fn(), update: vi.fn(), clearAll: vi.fn() };
    renderWithProviders(<FiltersSheet open onClose={onClose} lib={lib} facets={{ base: null, current: null }} sectionsOpen={{}} onToggleSection={() => {}} total={1} />);
    expect(screen.getByTestId('filters-sheet-show')).toHaveTextContent('Show 1 game');
    fireEvent.keyDown(screen.getByTestId('filters-sheet-show'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SaveViewDialog', () => {
  it('saves the whole filter JSON with the sort', async () => {
    const filter = { genres: ['RPG'], lengths: ['short'], tagMatch: 'all', tags: ['Cozy'] };
    const input = { name: 'Short cozy RPGs', filter, sortBy: 'timeToBeat', sortDir: 'asc' };
    const saved = vi.fn(() => ({
      data: {
        saveGameFilter: {
          __typename: 'GameProfile',
          customShelves: [],
          savedFilters: [{ __typename: 'GameSavedFilter', id: 'v1', name: input.name, filter, sortBy: 'timeToBeat', sortDir: 'asc', searchQuery: null, shelfFilter: null, platformFilter: null, ownedFilter: null }],
          platformsOwned: [],
          defaultPlatform: null,
          steamId: null,
          lastSteamSyncAt: null,
          playniteLastImportAt: null,
          playniteLastGeneratedAtUtc: null,
          playniteLastTotal: null,
        },
      },
    }));
    const onClose = vi.fn();
    renderWithProviders(
      <SaveViewDialog open onClose={onClose} filterInput={filter} sort="timeToBeat" dir="asc" chips={activeChips(stateOf(filter))} sortLabel="Length" />,
      { wrapper: ({ children }) => <MockedProvider mocks={[{ request: { query: SAVE_GAME_FILTER, variables: { input } }, result: saved }]}>{children}</MockedProvider> }
    );
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('RPG · Cozy · Short');
    fireEvent.change(name, { target: { value: 'Short cozy RPGs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
