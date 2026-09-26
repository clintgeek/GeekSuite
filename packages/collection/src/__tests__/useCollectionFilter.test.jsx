import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useCollectionFilter } from '../filter/useCollectionFilter';
import { BOOK_CODEC } from './fixtures';

let api;
const buildVariables = (state, page) => ({ page, limit: 24, sort: state.sort, filter: BOOK_CODEC.toFilterInput(state.filter), seed: state.seed ?? undefined });
function Probe({ options }) {
  api = useCollectionFilter(BOOK_CODEC, options);
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}
const mount = (search = '', options = { buildVariables }) =>
  render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <Probe options={options} />
    </MemoryRouter>
  );
const search = () => screen.getByTestId('search').textContent;

describe('useCollectionFilter', () => {
  it('toggles list values and the URL follows', () => {
    mount();
    act(() => api.toggle('authors', 'Banks'));
    act(() => api.toggle('authors', 'Le Guin'));
    expect(new URLSearchParams(search()).getAll('author')).toEqual(['Banks', 'Le Guin']);
    expect(api.filterInput).toEqual({ authors: ['Banks', 'Le Guin'] });
    expect(api.activeCount).toBe(2);
    act(() => api.toggle('authors', 'Banks'));
    expect(api.state.filter.authors).toEqual(['Le Guin']);
  });

  it('remove takes one value, or resets a whole key', () => {
    mount('?author=A&author=B&owned=1');
    act(() => api.remove('authors', 'A'));
    expect(api.state.filter.authors).toEqual(['B']);
    act(() => api.remove('owned'));
    expect(search()).toBe('?author=B');
  });

  it('clearAll drops every filter, the search and state fields, but keeps the sort and foreign params', () => {
    mount('?author=A&q=dune&v=compact&sort=rating&tab=x');
    act(() => api.clearAll());
    expect(search()).toBe('?tab=x&sort=rating');
    expect(api.filterInput).toBeNull();
  });

  it('variables(page) uses the app’s builder; the shuffle seed holds across pages until reshuffled', () => {
    mount();
    act(() => api.setSort('random'));
    const seed = api.state.seed;
    expect(seed).toBeGreaterThan(0);
    expect(api.variables(2)).toMatchObject({ page: 2, limit: 24, sort: 'random', seed });
    act(() => api.toggle('tags', 'Cozy'));
    expect(api.variables(3).seed).toBe(seed);
    act(() => api.reshuffle());
    expect(api.state.seed).not.toBe(seed);
  });

  it('a shared ?sort=random link without a seed gets one before it is ready', () => {
    mount('?sort=random');
    expect(api.ready).toBe(true);
    expect(Number(new URLSearchParams(search()).get('seed'))).toBeGreaterThan(0);
  });

  it('without a builder, variables are { page, filter }', () => {
    mount('?tag=Cozy', {});
    expect(api.variables(2)).toEqual({ page: 2, filter: { tags: ['Cozy'] } });
  });
});
