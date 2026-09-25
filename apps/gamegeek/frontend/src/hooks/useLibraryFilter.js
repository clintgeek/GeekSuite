/**
 * useLibraryFilter — the single source of truth for what the library shows.
 *
 * It reads the URL (utils/libraryFilter.js is the codec) and every change goes
 * back through it: the panel, the phone sheet, the chips, the sort menu, the
 * search box and the detail page's genre links all call these, never
 * `setSearchParams` themselves.
 *
 * History: a discrete choice (a checkbox, a chip, a sort) PUSHES, so back
 * undoes it — that is the "back works" promise. Continuous input (typing a
 * search) passes `{ replace: true }` so a word is one entry, not six.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMPTY_FILTER,
  activeFilterCount,
  buildGamesVariables,
  newSeed,
  readLibraryState,
  toFilterInput,
  writeLibraryState,
} from '../utils/libraryFilter';

export function useLibraryFilter() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  // Keyed on the string: a new URLSearchParams object with the same content
  // must not look like a new filter to every memo downstream.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => readLibraryState(params), [search]);
  const filterInput = useMemo(() => toFilterInput(state.filter), [state]);

  const update = useCallback(
    (patch, { replace = false } = {}) => setParams((prev) => writeLibraryState(prev, patch), { replace }),
    [setParams]
  );

  const toggle = useCallback(
    (key, value) =>
      setParams((prev) => {
        const current = readLibraryState(prev).filter[key] || [];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        return writeLibraryState(prev, { [key]: next });
      }),
    [setParams]
  );

  const remove = useCallback(
    (key, value) =>
      setParams((prev) => {
        const current = readLibraryState(prev).filter[key];
        if (Array.isArray(current) && value !== undefined) {
          return writeLibraryState(prev, { [key]: current.filter((v) => v !== value) });
        }
        return writeLibraryState(prev, { [key]: EMPTY_FILTER[key] });
      }),
    [setParams]
  );

  /** Every narrowing off, search included; the sort stays. */
  const clearAll = useCallback(
    () => setParams((prev) => writeLibraryState(prev, { filter: EMPTY_FILTER, owned: 'all' })),
    [setParams]
  );

  const setSort = useCallback((sort, dir) => update({ sort, dir }), [update]);
  const reshuffle = useCallback(() => update({ seed: newSeed() }), [update]);

  // A shared or hand-typed `?sort=random` has no seed yet. Mint one in place
  // (replace — it is not a user step) so every page after the first agrees.
  const needsSeed = state.sort === 'random' && !state.seed;
  useEffect(() => {
    if (needsSeed) update({ seed: newSeed() }, { replace: true });
  }, [needsSeed, update]);

  return {
    state,
    filterInput,
    activeCount: activeFilterCount(state),
    variables: useCallback((page = 1) => buildGamesVariables(state, page), [state]),
    ready: !needsSeed,
    update,
    toggle,
    remove,
    clearAll,
    setSort,
    reshuffle,
  };
}
