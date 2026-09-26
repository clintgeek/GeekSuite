/**
 * The library's book list for the filters in the URL — in the Apollo cache
 * (`Query.books`, graphql/cachePolicies.js), not a hand-managed array.
 *
 * One list per filter + sort; pages merge into it, so an edit anywhere
 * (rate, shelf, progress, metadata, cover) patches the row in place and never
 * collapses three loaded pages back to one. Revisiting a filter shows its
 * cached rows at once and refreshes the head behind them.
 *
 * Also here, because they are the library's and nobody else's: the infinite-
 * scroll sentinel, the `/api/health` check that gates the grid, the CSV
 * export of everything the filters match, and the (disabled) merge selection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useApolloClient, useQuery } from "@apollo/client";
import { GET_BOOKS } from "../graphql/queries.js";
import { writeRestBook, removeBookFromLists } from "../graphql/cachePolicies.js";
import { API_BASE } from "../utils/bookDisplay";
import { authFetch } from "../utils/authFetch";
import { buildBooksCsv, booksCsvFilename, UTF8_BOM } from "../utils/exportBooksCsv.js";
import { booksVariables } from "../utils/libraryParams";
import { refreshShelfSummary } from "./useBookActions";

export const LIBRARY_PAGE_SIZE = 50;
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

export function useLibrary({ params }) {
  const apolloClient = useApolloClient();
  const variables = booksVariables(params, { limit: LIBRARY_PAGE_SIZE });
  const variablesKey = JSON.stringify(variables);

  const { data, loading: queryLoading, error: queryError, fetchMore, refetch } = useQuery(GET_BOOKS, {
    variables: { ...variables, page: 1 },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: false,
  });

  const [healthError, setHealthError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  // A page that brought nothing new (a server that ignores `page`) stops the
  // sentinel for this filter instead of asking for the same page forever.
  const [exhaustedKey, setExhaustedKey] = useState(null);
  // `loadingMore` is state, so the IntersectionObserver callback closes over
  // whatever it was when the observer was built. A ref is read live, which is
  // what stops two rapid intersections from both appending the same page.
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef(null);

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

  // While a new filter loads, a list is only shown if it is this filter's
  // (no `previousData`): the old rows under the new filter's name would lie.
  const page = data?.books ?? null;
  const books = page?.items?.filter(Boolean) ?? [];
  const total = typeof page?.total === "number" ? page.total : books.length;
  const loading = queryLoading && !page;
  const error = healthError || (queryError && !page ? queryError.message || "Failed to load data" : null);
  // Paging is by what is loaded, not by the last page number: after a delete
  // or an in-place refresh the list is not a whole number of pages, and the
  // merge policy dedupes any overlap.
  const hasMore = Boolean(page) && books.length < total && exhaustedKey !== variablesKey && !error;

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const before = books.length;
    try {
      await checkHealth();
      const res = await fetchMore({
        variables: { ...variables, page: Math.floor(before / LIBRARY_PAGE_SIZE) + 1 },
      });
      const got = res?.data?.books?.items?.length ?? 0;
      const after = apolloClient.cache.readQuery({ query: GET_BOOKS, variables: { ...variables, page: 1 } })?.books?.items?.length ?? before;
      if (got === 0 || after <= before) setExhaustedKey(variablesKey);
    } catch (err) {
      // One transient append failure used to set `hasMore` false for the
      // rest of the session, permanently killing infinite scroll.
      setLoadMoreError(err.message || "Failed to load more books");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `variables` is keyed by `variablesKey`
  }, [books.length, fetchMore, variablesKey, apolloClient]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") return undefined;
    if (!hasMore || loadingMore || loading) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loadingMoreRef.current) loadMore();
    });

    const target = loadMoreRef.current;
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
      observer.disconnect();
    };
  }, [hasMore, loading, loadingMore, loadMore]);

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
      const { limit: _limit, sort, sortDir, ...filters } = variables;

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
      const filename = booksCsvFilename(filters);

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
    error,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMoreRef,
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
