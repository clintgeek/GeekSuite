/**
 * The library's pages of games for one filter + sort.
 *
 * Pagination lives in the cache (graphql/cachePolicies.js, `Query.games`):
 * each filter/sort has ONE list, pages merge into it by offset, and a
 * refetch of page 1 overwrites the first 48 slots instead of replacing the
 * list. So nothing an edit does can collapse a scrolled-down library to its
 * first page — the regression that snapped Chef back to the top after every
 * edit (2026-09-25).
 *
 * While a new filter loads, the previous list stays on screen (`previousData`).
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_GAMES } from '../graphql/queries';

export function useGamePages({ variables, ready = true }) {
  const [loadingMore, setLoadingMore] = useState(false);
  const { data, previousData, loading, error, fetchMore, refetch } = useQuery(GET_GAMES, {
    variables: variables(1),
    skip: !ready,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const shown = data ?? previousData;
  const page = shown?.games ?? null;
  const games = page?.games ?? [];
  // Paging is by what is loaded, not by the last page number: after a delete
  // or an in-place refresh the list is not a whole number of pages, and the
  // merge policy dedupes any overlap.
  const hasMore = Boolean(data?.games && page && games.length < page.total);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      // The `Query.games` merge policy puts the page at its offset.
      const first = variables(1);
      await fetchMore({ variables: variables(Math.floor(games.length / (first.limit || 48)) + 1) });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, fetchMore, variables, games.length]);

  return { page, games, hasMore, loading, refreshing: loading && Boolean(page), loadingMore, loadMore, error, refetch };
}
