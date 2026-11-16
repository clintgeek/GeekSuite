/**
 * Which of four things a data region should show — so a failed load is never
 * drawn as "nothing here" (plan bar item 2, 2.5).
 *
 *   'ready'   there is data to show. Wins even when a later refetch failed:
 *             keep the rows, say the failure some other way (a toast).
 *   'error'   no data, and the load failed → GeekLoadError with Retry.
 *   'loading' no data, no error, still loading.
 *   'empty'   loaded, no error, nothing there → GeekEmptyState.
 *
 * `isEmpty` decides what "no data" means; by default null/undefined, an empty
 * array, or an object with an empty `items`/`edges`/`nodes` array.
 *
 * @param {{ loading?: boolean, error?: unknown, data?: unknown,
 *   isEmpty?: (data: unknown) => boolean }} input
 * @returns {'ready' | 'error' | 'loading' | 'empty'}
 */
export function geekLoadStatus({ loading = false, error = null, data, isEmpty = defaultIsEmpty } = {}) {
  const hasData = !isEmpty(data);
  if (hasData) return 'ready';
  if (error) return 'error';
  if (loading) return 'loading';
  return 'empty';
}

function defaultIsEmpty(data) {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    for (const key of ['items', 'edges', 'nodes']) {
      if (Array.isArray(data[key])) return data[key].length === 0;
    }
  }
  return false;
}
