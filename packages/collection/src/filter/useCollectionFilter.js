/**
 * useCollectionFilter — the single source of truth for what a collection
 * list shows, read from and written to the URL through a codec
 * (`createFilterCodec`, filter/codec.js).
 *
 * Every change goes back through it: the panel, the phone sheet, the chips,
 * the sort menu, the search box. Nothing else should call `setSearchParams`
 * for the codec's own params.
 *
 * History: a discrete choice (a checkbox, a chip, a sort) PUSHES, so back
 * undoes it. Continuous input (typing a search) passes `{ replace: true }` so
 * a word is one entry, not six.
 *
 * `buildVariables(state, page)` (optional) is the app's mapping from state to
 * its list query's variables; `variables(page)` calls it with the current
 * state.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useCollectionFilter(codec, { buildVariables } = {}) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  // Keyed on the string: a new URLSearchParams object with the same content
  // must not look like a new filter to every memo downstream.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => codec.read(params), [search, codec]);
  const filterInput = useMemo(() => codec.toFilterInput(state.filter), [state, codec]);

  const update = useCallback(
    (patch, { replace = false } = {}) => setParams((prev) => codec.write(prev, patch), { replace }),
    [setParams, codec]
  );

  const toggle = useCallback(
    (key, value) =>
      setParams((prev) => {
        const current = codec.read(prev).filter[key] || [];
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        return codec.write(prev, { [key]: next });
      }),
    [setParams, codec]
  );

  const remove = useCallback(
    (key, value) =>
      setParams((prev) => {
        const current = codec.read(prev).filter[key];
        if (Array.isArray(current) && value !== undefined) {
          return codec.write(prev, { [key]: current.filter((v) => v !== value) });
        }
        return codec.write(prev, { [key]: codec.EMPTY_FILTER[key] });
      }),
    [setParams, codec]
  );

  /** Every narrowing off, search and state fields included; the sort stays. */
  const clearAll = useCallback(() => setParams((prev) => codec.write(prev, codec.clearPatch())), [setParams, codec]);

  const setSort = useCallback((sort, dir) => update({ sort, dir }), [update]);
  const reshuffle = useCallback(() => update({ seed: codec.newSeed() }), [update, codec]);

  // A shared or hand-typed `?sort=random` has no seed yet. Mint one in place
  // (replace — it is not a user step) so every page after the first agrees.
  const random = codec.sorts.random;
  const needsSeed = Boolean(random) && state.sort === random && !state.seed;
  useEffect(() => {
    if (needsSeed) update({ seed: codec.newSeed() }, { replace: true });
  }, [needsSeed, update, codec]);

  const variables = useCallback((page = 1) => (buildVariables ? buildVariables(state, page) : { page, filter: filterInput }), [
    buildVariables,
    state,
    filterInput,
  ]);

  return {
    state,
    filterInput,
    activeCount: codec.activeCount(state),
    variables,
    ready: !needsSeed,
    update,
    toggle,
    remove,
    clearAll,
    setSort,
    reshuffle,
  };
}
