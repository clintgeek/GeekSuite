/**
 * A collection's pages for one filter + sort, infinite-scroll style.
 *
 *   const list = usePagedList(GET_GAMES, { variables, ready, field: 'games', itemsField: 'games' });
 *   // → { page, items, hasMore, loading, refreshing, loadingMore, loadMore, error, refetch }
 *
 * `variables(page)` builds the query's variables for a page (it must carry
 * `page` and `limit`); `data[field]` is the page object and
 * `data[field][itemsField]` its rows, plus `total`.
 *
 * Pagination lives in the cache (`pagedListPolicy`, cache/pagedList.js): each
 * filter/sort has ONE list, pages merge into it, and a refresh of page 1
 * overwrites its head instead of replacing the list. So nothing an edit does
 * can collapse a scrolled-down list to its first page — the regression that
 * snapped GameGeek back to the top after every edit (2026-09-25).
 *
 * While a new filter loads, the previous list stays on screen (`previousData`).
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client';

export function usePagedList(query, { variables, ready = true, field, itemsField = 'items', pageSize = 48 }) {
  const [loadingMore, setLoadingMore] = useState(false);
  const { data, previousData, loading, error, fetchMore, refetch } = useQuery(query, {
    variables: variables(1),
    skip: !ready,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const shown = data ?? previousData;
  const page = shown?.[field] ?? null;
  const items = page?.[itemsField] ?? [];
  // Paging is by what is loaded, not by the last page number: after a delete
  // or an in-place refresh the list is not a whole number of pages, and the
  // merge policy dedupes any overlap.
  const hasMore = Boolean(data?.[field] && page && items.length < page.total);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      // The list's merge policy puts the page at its offset.
      const first = variables(1);
      await fetchMore({ variables: variables(Math.floor(items.length / (first.limit || pageSize)) + 1) });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, fetchMore, variables, items.length, pageSize]);

  return { page, items, hasMore, loading, refreshing: loading && Boolean(page), loadingMore, loadMore, error, refetch };
}
