/**
 * The library's data hooks: GameGeek's configuration of
 * `@geeksuite/collection` — its codec, its `GetGames` / `GetGameFacets`
 * queries, its page size. The behaviour (URL state, debounced facets, cached
 * pagination that never collapses, in-place refresh) lives in the package.
 *
 *   useLibraryFilter()        the URL-backed filter + sort (utils/libraryFilter.js is the schema)
 *   useGamePages(lib)         the pages for that filter; `games` is the merged list
 *   useGameFacets(filterInput) the panel's counts: { base, current, loading, error }
 *   refreshLibraryList(client, search) / useRefreshLibraryList()
 *                             after a create: one page-1 request as long as
 *                             what is loaded, merged in place — the reader
 *                             keeps every row and their scroll position. The
 *                             `search` is the library's query string (the Add
 *                             dialog carries it), so the refresh targets the
 *                             list actually on screen underneath.
 */
import { useCallback } from 'react';
import { useApolloClient } from '@apollo/client';
import { refreshPagedList, useCollectionFilter, useFacetQuery, usePagedList } from '@geeksuite/collection';
import { GET_GAMES, GET_GAME_FACETS } from '../graphql/queries';
import { LIBRARY_CODEC, PAGE_SIZE, buildGamesVariables, readLibraryState } from '../utils/libraryFilter';

const FILTER_OPTIONS = { buildVariables: buildGamesVariables };

export function useLibraryFilter() {
  return useCollectionFilter(LIBRARY_CODEC, FILTER_OPTIONS);
}

export function useGamePages({ variables, ready = true }) {
  const list = usePagedList(GET_GAMES, { variables, ready, field: 'games', itemsField: 'games', pageSize: PAGE_SIZE });
  return { ...list, games: list.items };
}

export function useGameFacets(filterInput) {
  return useFacetQuery(GET_GAME_FACETS, filterInput, { field: 'gameFacets' });
}

export async function refreshLibraryList(client, search = '') {
  const variables = buildGamesVariables(readLibraryState(new URLSearchParams(search)), 1);
  await refreshPagedList(client, { query: GET_GAMES, variables, field: 'games', itemsField: 'games', pageSize: PAGE_SIZE });
}

export function useRefreshLibraryList() {
  const client = useApolloClient();
  return useCallback((search) => refreshLibraryList(client, search), [client]);
}
