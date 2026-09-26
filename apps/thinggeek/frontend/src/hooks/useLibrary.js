/**
 * The library's data hooks: ThingGeek's configuration of
 * `@geeksuite/collection` — its codec, its `GetThings` / `GetThingFacets`
 * queries, its page size. The behaviour (URL state, debounced facets, cached
 * pagination that never collapses, in-place refresh) lives in the package.
 */
import { useCallback } from 'react';
import { useApolloClient } from '@apollo/client';
import { refreshPagedList, useCollectionFilter, useFacetQuery, usePagedList } from '@geeksuite/collection';
import { GET_THINGS, GET_THING_FACETS } from '../graphql/queries';
import { LIBRARY_CODEC, PAGE_SIZE, buildThingsVariables, readLibraryState } from '../utils/libraryFilter';

const FILTER_OPTIONS = { buildVariables: buildThingsVariables };

export function useLibraryFilter() {
  return useCollectionFilter(LIBRARY_CODEC, FILTER_OPTIONS);
}

export function useThingPages({ variables, ready = true }) {
  const list = usePagedList(GET_THINGS, { variables, ready, field: 'things', itemsField: 'things', pageSize: PAGE_SIZE });
  return { ...list, things: list.items };
}

export function useThingFacets(filterInput) {
  return useFacetQuery(GET_THING_FACETS, filterInput, { field: 'thingFacets' });
}

/**
 * After a create or a restore: one page-1 request as long as what is loaded,
 * merged in place — the reader keeps every row and their scroll position.
 * `search` is the library's query string, so the refresh targets the list
 * actually on screen underneath.
 */
export async function refreshLibraryList(client, search = '') {
  const variables = buildThingsVariables(readLibraryState(new URLSearchParams(search)), 1);
  await refreshPagedList(client, { query: GET_THINGS, variables, field: 'things', itemsField: 'things', pageSize: PAGE_SIZE });
}

export function useRefreshLibraryList() {
  const client = useApolloClient();
  return useCallback((search) => refreshLibraryList(client, search).catch(() => {}), [client]);
}
