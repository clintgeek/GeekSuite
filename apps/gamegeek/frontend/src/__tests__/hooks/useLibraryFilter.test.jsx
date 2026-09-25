import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useLibraryFilter } from '../../hooks/useLibraryFilter';

let api;
function Probe() {
  api = useLibraryFilter();
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

const mount = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <Probe />
    </MemoryRouter>
  );
const search = () => screen.getByTestId('search').textContent;

describe('useLibraryFilter', () => {
  it('toggles values in and out of a list, and the URL follows', () => {
    mount();
    act(() => api.toggle('genres', 'RPG'));
    act(() => api.toggle('genres', 'Puzzle'));
    expect(new URLSearchParams(search()).getAll('genre')).toEqual(['RPG', 'Puzzle']);
    expect(api.filterInput).toEqual({ genres: ['RPG', 'Puzzle'] });
    expect(api.activeCount).toBe(2);
    act(() => api.toggle('genres', 'RPG'));
    expect(api.state.filter.genres).toEqual(['Puzzle']);
  });

  it('clearAll drops every filter and the search but keeps the sort', () => {
    mount('?genre=RPG&store=steam&q=zel&sort=rating&owned=true');
    act(() => api.clearAll());
    expect(search()).toBe('?sort=rating');
    expect(api.filterInput).toBeNull();
  });

  it('random sort keeps one seed for every page until reshuffled', () => {
    mount();
    act(() => api.setSort('random'));
    const seed = api.state.seed;
    expect(seed).toBeGreaterThan(0);
    expect(new URLSearchParams(search()).get('seed')).toBe(String(seed));
    expect(api.variables(1).seed).toBe(seed);
    expect(api.variables(2)).toMatchObject({ page: 2, seed });
    expect(api.variables(3).seed).toBe(seed);
    act(() => api.toggle('tags', 'Cozy'));
    expect(api.variables(2).seed).toBe(seed);
    act(() => api.reshuffle());
    expect(api.state.seed).not.toBe(seed);
  });

  it('a shared ?sort=random link without a seed gets one before it queries', () => {
    mount('?sort=random');
    expect(api.ready).toBe(true);
    expect(Number(new URLSearchParams(search()).get('seed'))).toBeGreaterThan(0);
  });
});
