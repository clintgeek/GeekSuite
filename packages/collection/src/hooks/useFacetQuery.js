/**
 * The filter panel's counts, from the app's facet query.
 *
 *   const facets = useFacetQuery(GET_GAME_FACETS, filterInput, { field: 'gameFacets' });
 *
 *   - `base` is the unfiltered collection, fetched once and cached: it fixes
 *     the order and the universe of options (facets/options.js).
 *   - `current` follows the same filter object the results use, debounced
 *     ~150ms so a burst of checkbox taps is one request, and it keeps showing
 *     the previous answer while the next one loads — counts change in place,
 *     never flash to blank.
 * With nothing narrowing, `current` IS `base`; no second request.
 *
 * The query takes one variable, `filter` (the app's filter input type), and
 * answers `data[field]`.
 */
import { useQuery } from '@apollo/client';
import { useDebouncedValue } from './useDebouncedValue';

export const FACET_DEBOUNCE_MS = 150;

export function useFacetQuery(query, filterInput, { field, delay = FACET_DEBOUNCE_MS } = {}) {
  const key = useDebouncedValue(filterInput ? JSON.stringify(filterInput) : '', delay);
  const filter = key ? JSON.parse(key) : null;

  const base = useQuery(query, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const live = useQuery(query, {
    variables: { filter },
    skip: !filter,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const baseFacets = base.data?.[field] ?? null;
  const liveFacets = filter ? (live.data ?? live.previousData)?.[field] ?? null : baseFacets;
  const settling = (filterInput ? JSON.stringify(filterInput) : '') !== key;

  return {
    base: baseFacets,
    current: liveFacets,
    loading: settling || (filter ? live.loading : base.loading),
    error: base.error || live.error || null,
  };
}
