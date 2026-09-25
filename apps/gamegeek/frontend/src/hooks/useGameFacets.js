/**
 * The filter panel's counts (DOCS/TAGS_AND_FILTERS.md §B1 `gameFacets`).
 *
 *   - `base` is the unfiltered library, fetched once and cached: it fixes the
 *     order and the universe of options (see utils/facets.js).
 *   - `current` follows the same filter object the results use, debounced
 *     ~150ms so a burst of checkbox taps is one request, and it keeps showing
 *     the previous answer while the next one loads — counts change in place,
 *     never flash to blank.
 * With nothing narrowing, `current` IS `base`; no second request.
 */
import { useQuery } from '@apollo/client';
import { GET_GAME_FACETS } from '../graphql/queries';
import { useDebouncedValue } from './useDebouncedValue';

export const FACET_DEBOUNCE_MS = 150;

export function useGameFacets(filterInput, { delay = FACET_DEBOUNCE_MS } = {}) {
  const key = useDebouncedValue(filterInput ? JSON.stringify(filterInput) : '', delay);
  const filter = key ? JSON.parse(key) : null;

  const base = useQuery(GET_GAME_FACETS, { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const live = useQuery(GET_GAME_FACETS, {
    variables: { filter },
    skip: !filter,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const baseFacets = base.data?.gameFacets ?? null;
  const liveFacets = filter ? (live.data ?? live.previousData)?.gameFacets ?? null : baseFacets;
  const settling = (filterInput ? JSON.stringify(filterInput) : '') !== key;

  return {
    base: baseFacets,
    current: liveFacets,
    loading: settling || (filter ? live.loading : base.loading),
    error: base.error || live.error || null,
  };
}
