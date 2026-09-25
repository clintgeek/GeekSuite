/**
 * After a create, bring the library list up to date WITHOUT collapsing it:
 * one `games` request for page 1 with `limit` = everything already loaded,
 * merged over the cached list at offset 0 (graphql/cachePolicies.js). The
 * reader keeps every row they had and their scroll position; a new game
 * shows up where it sorts.
 *
 * `search` is the library's query string (the Add dialog carries it), so the
 * refresh targets the list that is actually on screen underneath.
 */
import { useCallback } from 'react';
import { useApolloClient } from '@apollo/client';
import { GET_GAMES } from '../graphql/queries';
import { PAGE_SIZE, buildGamesVariables, readLibraryState } from '../utils/libraryFilter';

export async function refreshLibraryList(client, search = '') {
  const variables = buildGamesVariables(readLibraryState(new URLSearchParams(search)), 1);
  let loaded = 0;
  try {
    loaded = client.readQuery({ query: GET_GAMES, variables })?.games?.games?.length ?? 0;
  } catch {
    loaded = 0;
  }
  await client.query({
    query: GET_GAMES,
    variables: { ...variables, limit: Math.max(PAGE_SIZE, loaded) },
    fetchPolicy: 'network-only',
  });
}

export function useRefreshLibraryList() {
  const client = useApolloClient();
  return useCallback((search) => refreshLibraryList(client, search), [client]);
}
