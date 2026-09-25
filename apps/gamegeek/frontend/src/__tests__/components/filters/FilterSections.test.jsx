import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import FilterSections from '../../../components/filters/FilterSections';
import { DEFAULT_OPEN } from '../../../utils/facets';
import { DEFAULT_STATE, EMPTY_FILTER } from '../../../utils/libraryFilter';
import { renderWithProviders } from '../../testUtils';

const fv = (pairs) => pairs.map(([value, count]) => ({ value, count }));

const BASE = {
  total: 40,
  shelves: fv([['backlog', 20], ['playing', 5], ['finished', 15]]),
  genres: fv([['RPG', 12], ['Platformer', 8], ['Puzzle', 3]]),
  tags: fv([['Roguelike', 9], ['Cozy', 4], ['Couch night', 2]]),
  storefronts: fv([['steam', 30], ['gog', 6], ['epic', 4]]),
  platforms: fv([['pc', 32], ['switch', 8]]),
  formats: fv([['digital', 35], ['subscription', 5]]),
  modes: fv([['single', 38], ['coop-online', 7]]),
  played: fv([['never', 18], ['played', 22], ['recent', 4]]),
  lengths: fv([['short', 6], ['medium', 9], ['unknown', 25]]),
  metadata: fv([['matched', 36], ['no-match', 3], ['ambiguous', 1]]),
  releaseYears: [{ year: 2015, count: 10 }, { year: 2020, count: 30 }],
  favorites: 7,
};

function lib(filter = {}) {
  return {
    state: { ...DEFAULT_STATE, filter: { ...EMPTY_FILTER, ...filter } },
    toggle: vi.fn(),
    update: vi.fn(),
  };
}

function renderSections(l, current = BASE) {
  return renderWithProviders(
    <FilterSections lib={l} facets={{ base: BASE, current }} open={{ ...DEFAULT_OPEN, modes: true, format: true, metadata: true }} onToggleSection={() => {}} />
  );
}

describe('FilterSections', () => {
  it('lists each store with its live count and toggles the value', () => {
    const l = lib();
    renderSections(l, { ...BASE, storefronts: fv([['steam', 11], ['gog', 2], ['epic', 1]]) });
    const store = screen.getByRole('group', { name: 'Store' });
    const steam = within(store).getByRole('checkbox', { name: 'Steam, 11 games' });
    expect(steam).not.toBeChecked();
    fireEvent.click(steam);
    expect(l.toggle).toHaveBeenCalledWith('storefronts', 'steam');
  });

  it('keeps a selected option that now counts zero on screen, checked and dimmed', () => {
    const l = lib({ genres: ['Puzzle', 'Visual Novel'] });
    renderSections(l, { ...BASE, genres: fv([['RPG', 4]]) });
    const genre = screen.getByRole('group', { name: 'Genre' });
    const puzzle = within(genre).getByRole('checkbox', { name: /Puzzle/ });
    expect(puzzle).toBeChecked();
    // Neither answer lists "Visual Novel" at all — selected still shows.
    expect(within(genre).getByRole('checkbox', { name: 'Visual Novel, 0 games' })).toBeChecked();
    // An unselected zero stays too, marked empty (dimmed), not hidden.
    const platformer = within(genre).getByRole('checkbox', { name: 'Platformer, 0 games' });
    expect(platformer.closest('label')).toHaveAttribute('data-empty', 'true');
  });

  it('Played is a single choice with Any', () => {
    const l = lib({ played: 'never' });
    renderSections(l);
    const played = screen.getByRole('group', { name: 'Played' });
    expect(within(played).getByRole('radio', { name: /Never played/ })).toBeChecked();
    fireEvent.click(within(played).getByRole('radio', { name: /Any/ }));
    expect(l.update).toHaveBeenCalledWith({ played: '' });
  });

  it('groups tags by vocabulary, with the household’s own under “Your tags”', () => {
    renderSections(lib());
    expect(screen.getByRole('group', { name: 'Gameplay tags' })).toHaveTextContent('Roguelike');
    expect(screen.getByRole('group', { name: 'Story & mood tags' })).toHaveTextContent('Cozy');
    expect(screen.getByRole('group', { name: 'Your tags' })).toHaveTextContent('Couch night');
  });

  it('section headings are buttons that report and flip their state', () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <FilterSections lib={lib({ storefronts: ['steam'] })} facets={{ base: BASE, current: BASE }} open={{ store: true }} onToggleSection={onToggle} />
    );
    const store = screen.getByRole('button', { name: /^Store/ });
    expect(store).toHaveAttribute('aria-expanded', 'true');
    expect(store).toHaveTextContent('1 selected');
    const genre = screen.getByRole('button', { name: /^Genre/ });
    expect(genre).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(genre);
    expect(onToggle).toHaveBeenCalledWith('genre');
  });

  it('favorites is a switch with its count', () => {
    const l = lib();
    renderSections(l);
    fireEvent.click(screen.getByRole('checkbox', { name: /Only favorites/ }));
    expect(l.update).toHaveBeenCalledWith({ favorite: true });
  });
});
