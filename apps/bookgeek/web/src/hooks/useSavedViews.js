/**
 * Saved library views — the sidebar's list (`@geeksuite/collection`
 * SavedViews) and "Save view" (components/SaveLibraryView.jsx). Per-user, on
 * the gateway: `libraryFilters`, `saveLibraryFilter`, `deleteLibraryFilter`;
 * each write answers with the whole new list, which is written straight back
 * over `libraryFilters` in the Apollo cache, so every reader updates at once.
 *
 * A new view is saved with the whole BookFilterInput as `filter` plus its
 * sort; views saved before Phase C2 have only the legacy fields and open
 * through utils/libraryFilter.js `savedViewSearch`, which maps them to the
 * list their old "apply" showed.
 */
import { useCallback } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { GET_LIBRARY_FILTERS } from "../graphql/queries.js";
import { DELETE_LIBRARY_FILTER, SAVE_LIBRARY_FILTER } from "../graphql/mutations.js";
import { legacyFieldsFor } from "../utils/libraryFilter";

const writeList = (field) => (cache, { data }) => {
  const list = data?.[field];
  if (Array.isArray(list)) cache.writeQuery({ query: GET_LIBRARY_FILTERS, data: { libraryFilters: list } });
};

export function useSavedViews() {
  const { data, error } = useQuery(GET_LIBRARY_FILTERS, { fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first" });
  const [saveMutation] = useMutation(SAVE_LIBRARY_FILTER, { update: writeList("saveLibraryFilter") });
  const [deleteMutation] = useMutation(DELETE_LIBRARY_FILTER, { update: writeList("deleteLibraryFilter") });

  /** Save the current filter + sort under `name`. Rejects on failure (the dialog shows it). */
  const save = useCallback(
    (name, { filterInput, sort, dir }) =>
      saveMutation({
        variables: {
          input: {
            name,
            filter: filterInput ?? {},
            sortBy: sort,
            sortDir: sort === "random" ? "asc" : dir,
            ...legacyFieldsFor(filterInput),
          },
        },
      }),
    [saveMutation]
  );

  const remove = useCallback((view) => deleteMutation({ variables: { id: view.id } }), [deleteMutation]);

  return {
    views: Array.isArray(data?.libraryFilters) ? data.libraryFilters : [],
    error: error ? error.message || "Saved views did not load." : null,
    save,
    remove,
  };
}
