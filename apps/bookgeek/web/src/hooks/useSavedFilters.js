/**
 * Saved library filters (the sidebar's "Saved Filters" and the filter
 * sheet's presets). Per-user, on the gateway: `libraryFilters`,
 * `saveLibraryFilter`, `deleteLibraryFilter` — each write answers with the
 * whole new list.
 *
 * Applying a preset writes all six filters to the URL in one navigation
 * (hooks/useLibraryParams.jsx). Phase C2 replaces this with the shared
 * `@geeksuite/collection` saved views; until then it is the old behaviour,
 * moved out of App.jsx unchanged.
 */
import { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { GET_LIBRARY_FILTERS } from "../graphql/queries.js";
import { DELETE_LIBRARY_FILTER, SAVE_LIBRARY_FILTER } from "../graphql/mutations.js";

export function useSavedFilters({ params, shelves }) {
  const apolloClient = useApolloClient();
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedFiltersLoading, setSavedFiltersLoading] = useState(false);
  const [savedFiltersError, setSavedFiltersError] = useState(null);
  const [saveFilterLoading, setSaveFilterLoading] = useState(false);
  const [saveFilterError, setSaveFilterError] = useState(null);
  const [deleteFilterLoadingId, setDeleteFilterLoadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSavedFiltersLoading(true);
    setSavedFiltersError(null);
    apolloClient
      .query({ query: GET_LIBRARY_FILTERS, fetchPolicy: "no-cache" })
      .then(({ data }) => {
        if (!cancelled) setSavedFilters(Array.isArray(data?.libraryFilters) ? data.libraryFilters : []);
      })
      .catch((err) => {
        if (!cancelled) setSavedFiltersError(err.message || "Failed to load saved filters");
      })
      .finally(() => {
        if (!cancelled) setSavedFiltersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apolloClient]);

  const { setFilters } = params;
  const applySavedFilter = useCallback(
    (preset) => {
      if (!preset) return;
      setFilters({
        sortBy: preset.sortBy || "title",
        sortDir: preset.sortDir || "asc",
        searchQuery: preset.searchQuery || "",
        authorFilter: preset.authorFilter || "",
        tagFilter: preset.tagFilter || "",
        shelfFilter: preset.shelfFilter || "all",
      });
    },
    [setFilters]
  );

  async function handleSaveCurrentFilter() {
    const { searchQuery, authorFilter, tagFilter, shelfFilter, sortBy, sortDir } = params;
    const hasAnyFilter =
      searchQuery.trim() ||
      authorFilter.trim() ||
      tagFilter.trim() ||
      shelfFilter !== "all";

    if (!hasAnyFilter) {
      setSaveFilterError("Adjust filters before saving a preset.");
      return;
    }

    const defaultName =
      searchQuery.trim() ||
      (shelfFilter !== "all"
        ? shelves.find((s) => s.id === shelfFilter)?.label || shelfFilter
        : "Library filter");

    const name = window.prompt("Save filter as:", defaultName);
    if (!name || !name.trim()) {
      return;
    }

    setSaveFilterLoading(true);
    setSaveFilterError(null);
    try {
      const { data } = await apolloClient.mutate({
        mutation: SAVE_LIBRARY_FILTER,
        variables: {
          input: {
            name: name.trim(),
            sortBy,
            sortDir,
            searchQuery,
            authorFilter,
            tagFilter,
            shelfFilter,
          },
        },
      });
      setSavedFilters(Array.isArray(data?.saveLibraryFilter) ? data.saveLibraryFilter : []);
    } catch (err) {
      setSaveFilterError(err.message || "Failed to save filter");
    } finally {
      setSaveFilterLoading(false);
    }
  }

  async function handleDeleteSavedFilter(id) {
    if (!id) return;

    const confirmed = window.confirm("Delete this saved filter?");
    if (!confirmed) return;

    setDeleteFilterLoadingId(id);
    setSavedFiltersError(null);
    try {
      const { data } = await apolloClient.mutate({
        mutation: DELETE_LIBRARY_FILTER,
        variables: { id },
      });
      setSavedFilters(Array.isArray(data?.deleteLibraryFilter) ? data.deleteLibraryFilter : []);
    } catch (err) {
      setSavedFiltersError(err.message || "Failed to delete filter");
    } finally {
      setDeleteFilterLoadingId(null);
    }
  }

  return {
    savedFilters,
    savedFiltersLoading,
    savedFiltersError,
    saveFilterLoading,
    saveFilterError,
    deleteFilterLoadingId,
    applySavedFilter,
    handleSaveCurrentFilter,
    handleDeleteSavedFilter,
  };
}
