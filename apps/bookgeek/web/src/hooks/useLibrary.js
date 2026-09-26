/**
 * The library's data: the book list and the filter panel's counts for the
 * filters in the URL — BookGeek's binding of `@geeksuite/collection`
 * (`usePagedList` over `GetBooks`, `useFacetQuery` over `GetBookFacets`; the
 * list lives in the Apollo cache, graphql/cachePolicies.js).
 *
 * One list per filter + sort; pages merge into it, so an edit anywhere
 * (rate, shelf, progress, metadata, cover) patches the row in place and never
 * collapses three loaded pages back to one. Revisiting a filter shows its
 * cached rows at once and refreshes the head behind them; a new filter keeps
 * the previous rows on screen (dimmed, `refreshing`) until its own arrive.
 *
 * Also here, because they are the library's and nobody else's: the
 * `/api/health` check that gates the grid, a load-more that says when it
 * failed, the CSV export of everything the filters match, and the (disabled)
 * merge selection.
 */
import { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useFacetQuery, usePagedList } from "@geeksuite/collection";
import { GET_BOOKS, GET_BOOK_FACETS } from "../graphql/queries.js";
import { writeRestBook, removeBookFromLists } from "../graphql/cachePolicies.js";
import { API_BASE } from "../utils/bookDisplay";
import { authFetch } from "../utils/authFetch";
import { buildBooksCsv, booksCsvFilename, UTF8_BOM } from "../utils/exportBooksCsv.js";
import { PAGE_SIZE } from "../utils/libraryFilter";
import { refreshShelfSummary } from "./useBookActions";

export const LIBRARY_PAGE_SIZE = PAGE_SIZE;
const showMergeUi = false;

/**
 * The bookgeek API must answer before the grid is trusted: a failed health
 * check is the full-page "Could not load your library", as it always was.
 */
async function checkHealth() {
  const res = await fetch(`${ API_BASE }/health`, { cache: "no-store" });
  await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Health check failed (${ res.status })`);
}

/** The panel's counts: `{ base, current, loading, error }`. */
export function useBookFacets(filterInput) {
  return useFacetQuery(GET_BOOK_FACETS, filterInput, { field: "bookFacets" });
}

/** `lib` is hooks/useLibraryParams's — the package's URL-backed filter state. */
export function useLibrary({ lib }) {
  const apolloClient = useApolloClient();
  const list = usePagedList(GET_BOOKS, {
    variables: lib.variables,
    ready: lib.ready,
    field: "books",
    itemsField: "items",
    pageSize: PAGE_SIZE,
  });
  const variables = lib.variables(1);
  const variablesKey = JSON.stringify(variables);

  const [healthError, setHealthError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);
  // A page that brought nothing new (a server that ignores `page`) stops the
  // sentinel for this filter instead of asking for the same page forever.
  const [exhaustedKey, setExhaustedKey] = useState(null);

  // Health, and the shelf counts, on every filter change — as the old
  // page-1 load did.
  useEffect(() => {
    let cancelled = false;
    setHealthError(null);
    setLoadMoreError(null);
    checkHealth().catch((err) => {
      if (!cancelled) setHealthError(err.message || "Failed to load data");
    });
    refreshShelfSummary(apolloClient);
    return () => {
      cancelled = true;
    };
  }, [variablesKey, apolloClient]);

  const page = list.page;
  const books = list.items.filter(Boolean);
  const total = typeof page?.total === "number" ? page.total : null;
  const loading = !page && (list.loading || !lib.ready);
  const error = healthError || (list.error && !page ? list.error.message || "Failed to load data" : null);
  const hasMore = list.hasMore && exhaustedKey !== variablesKey && !error;

  const { loadMore: loadNextPage } = list;
  const loadMore = useCallback(async () => {
    setLoadMoreError(null);
    const before = books.length;
    try {
      await checkHealth();
      await loadNextPage();
      const after =
        apolloClient.cache.readQuery({ query: GET_BOOKS, variables })?.books?.items?.length ?? before;
      if (after <= before) setExhaustedKey(variablesKey);
    } catch (err) {
      // One transient append failure used to set `hasMore` false for the
      // rest of the session, permanently killing infinite scroll.
      setLoadMoreError(err.message || "Failed to load more books");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `variables` is keyed by `variablesKey`
  }, [books.length, loadNextPage, variablesKey, apolloClient]);

  const { refetch } = list;
  const onRetry = useCallback(async () => {
    setHealthError(null);
    try {
      await checkHealth();
    } catch (err) {
      setHealthError(err.message || "Failed to load data");
      return;
    }
    // Nothing is loaded when the grid shows its error, so a plain refetch
    // has nothing to collapse.
    refetch().catch(() => {});
  }, [refetch]);

  // ── CSV export ─────────────────────────────────────────────────────────
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  /**
   * Export the books the current filters match, as CSV.
   *
   * NOT the rows React has rendered. The grid pages 50 at a time behind a
   * load-more sentinel, so the rendered rows are usually a prefix of the
   * match — exporting those would quietly hand back 50 of 200 books. This
   * re-runs the SAME query with the SAME filters and sort and walks every
   * page, so the file is "everything this view is showing you", in the order
   * you would reach it by scrolling. `no-cache`: the walk must not write its
   * 100-row pages into the list the grid is showing.
   *
   * The server caps `limit` at 100, so the page size here is 100 and not a
   * number of our choosing — asking for more silently returns 100 and the
   * loop would never terminate if it trusted the request instead of the
   * response.
   */
  async function handleExportCsv() {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const { limit: _limit, page: _page, sort, sortDir, ...filters } = variables;

      const PAGE_SIZE = 100;
      const collected = [];
      let pageToLoad = 1;
      let guard = 0;

      // Bounded: `guard` stops a bad `total` or a server that ignores `page`
      // from spinning forever. 200 pages at 100 each is 20k books, well past
      // any real library, and failing loudly beats hanging the tab.
      while (guard < 200) {
        guard += 1;
        const res = await apolloClient.query({
          query: GET_BOOKS,
          variables: { ...filters, page: pageToLoad, limit: PAGE_SIZE, sort, sortDir },
          fetchPolicy: "no-cache",
        });
        const payload = res.data?.books || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        collected.push(...items);

        const totalCount = typeof payload.total === "number" ? payload.total : collected.length;
        // Trust the RESPONSE's page size, not the one requested.
        const pageSize =
          typeof payload.pageSize === "number" && payload.pageSize > 0 ? payload.pageSize : items.length;
        if (items.length === 0 || collected.length >= totalCount || pageSize === 0) break;
        pageToLoad += 1;
      }

      const csv = buildBooksCsv(collected);
      const f = filters.filter ?? {};
      const filename = booksCsvFilename({
        shelf: f.shelves?.length === 1 ? f.shelves[0] : undefined,
        author: f.authors?.[0] ?? f.authorText,
        tag: f.tags?.[0],
        q: f.q,
      });

      // The BOM is what makes Excel read this as UTF-8 rather than the local
      // codepage; see the util's header.
      const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportError(null);
      setExportNotice(`Exported ${ collected.length } ${ collected.length === 1 ? "book" : "books" }.`);
    } catch (err) {
      // Surfaced, not swallowed: a failed export that looks like a successful
      // one is the exact pattern this suite keeps having to fix.
      setExportError(err?.message || "Could not export the library.");
      setExportNotice(null);
    } finally {
      setExportingCsv(false);
    }
  }

  // ── Merge selection (the UI is off: `showMergeUi`) ─────────────────────
  const [selectedBookIds, setSelectedBookIds] = useState([]);
  const [mergeSelectionError, setMergeSelectionError] = useState(null);
  const [mergeLoading, setMergeLoading] = useState(false);

  function toggleBookSelection(bookId, event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    setMergeSelectionError(null);
    setSelectedBookIds((prev) => {
      if (prev.includes(bookId)) return prev.filter((id) => id !== bookId);
      if (prev.length >= 2) return prev;
      return [...prev, bookId];
    });
  }

  async function handleMergeSelectedBooks() {
    if (selectedBookIds.length !== 2) {
      setMergeSelectionError("Select exactly two books to merge.");
      return;
    }

    const [idA, idB] = selectedBookIds;
    const a = books.find((b) => (b.id || b._id) === idA);
    const b = books.find((b) => (b.id || b._id) === idB);

    if (!a || !b) {
      setMergeSelectionError("Selected books are no longer in the current list.");
      return;
    }

    const aIsGr = a.source === "goodreads-import";
    const bIsGr = b.source === "goodreads-import";

    if (aIsGr === bIsGr) {
      setMergeSelectionError(
        "Manual merge currently supports merging one Goodreads-import book into one library book."
      );
      return;
    }

    const primary = aIsGr ? b : a;
    const secondary = aIsGr ? a : b;

    setMergeLoading(true);
    setMergeSelectionError(null);

    try {
      const res = await authFetch("/books/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId: (primary.id || primary._id),
          secondaryId: (secondary.id || secondary._id),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Merge failed";
        throw new Error(message);
      }

      const updatedPrimary = json?.data?.primary || null;
      const deletedId = json?.data?.deletedId?.toString?.();
      if (updatedPrimary) {
        writeRestBook(apolloClient.cache, updatedPrimary);
        if (deletedId) removeBookFromLists(apolloClient.cache, deletedId);
      }

      setSelectedBookIds([]);
    } catch (err) {
      setMergeSelectionError(err.message || "Merge failed.");
    } finally {
      setMergeLoading(false);
    }
  }

  return {
    books,
    total,
    loading,
    refreshing: list.refreshing,
    error,
    hasMore,
    loadingMore: list.loadingMore,
    loadMoreError,
    loadMore,
    onRetry,
    exportingCsv,
    exportError,
    exportNotice,
    handleExportCsv,
    showMergeUi,
    selectedBookIds,
    toggleBookSelection,
    mergeLoading,
    mergeSelectionError,
    handleMergeSelectedBooks,
  };
}
