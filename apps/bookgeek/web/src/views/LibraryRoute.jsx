/**
 * `/` — the library route. Wires the URL filters (hooks/useLibraryParams),
 * the cached book list (hooks/useLibrary), the What-next strip
 * (hooks/useWhatNext) and the session's basket/saved filters into
 * `LibraryView`, whose props are unchanged. `/book/:id` renders into the
 * <Outlet/> over it, so opening a book never unmounts the grid: the scroll
 * position and every loaded page are still there when the sheet closes.
 */
import React, { useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useToast } from "@geeksuite/ui";
import { bookPath } from "../components/navConfig";
import { useBookActions } from "../hooks/useBookActions";
import { useBookGeek } from "../hooks/useBookGeek";
import { useLibrary } from "../hooks/useLibrary";
import { useLibraryParams } from "../hooks/useLibraryParams";
import { useWhatNext } from "../hooks/useWhatNext";
import LibraryView from "./LibraryView";

export default function LibraryRoute() {
  const params = useLibraryParams();
  const session = useBookGeek();
  const library = useLibrary({ params });
  const actions = useBookActions();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { basket, savedFilters, shelves, shelfSummary, rateBook } = session;

  const openBook = useCallback(
    (book) => {
      const id = book?.id || book?._id;
      if (id) navigate(bookPath(id, params.search), { state: { fromLibrary: true } });
    },
    [navigate, params.search]
  );

  const whatNext = useWhatNext({
    enabled: session.settings.libraryAssistantPref,
    onUpdateShelf: async (book, shelf) => {
      if ((shelf || "") === (book.shelf || "")) return true;
      try {
        await actions.updateShelf(book, shelf);
        return true;
      } catch (err) {
        console.error("Failed to update shelf", err);
        notify(err?.message || "Failed to update shelf", { tone: "error" });
        return false;
      }
    },
  });

  return (
    <>
      <LibraryView
        activeView={params.activeView}
        applySavedFilter={savedFilters.applySavedFilter}
        {...whatNext}
        authorFilter={params.authorFilter}
        basketBookIds={basket.basketBookIds}
        basketError={basket.basketError}
        basketLoading={basket.basketLoading}
        books={library.books}
        onRateBook={rateBook}
        clearBasket={basket.clearBasket}
        error={library.error}
        handleCreateDeviceBasket={basket.handleCreateDeviceBasket}
        handleMergeSelectedBooks={library.handleMergeSelectedBooks}
        handleExportCsv={library.handleExportCsv}
        exportingCsv={library.exportingCsv}
        exportError={library.exportError}
        exportNotice={library.exportNotice}
        handleSaveCurrentFilter={savedFilters.handleSaveCurrentFilter}
        hasMore={library.hasMore}
        loadMoreError={library.loadMoreError}
        loadMoreRef={library.loadMoreRef}
        loading={library.loading}
        loadingMore={library.loadingMore}
        mergeLoading={library.mergeLoading}
        mergeSelectionError={library.mergeSelectionError}
        onRetry={library.onRetry}
        saveFilterLoading={savedFilters.saveFilterLoading}
        savedFilters={savedFilters.savedFilters}
        savedFiltersError={savedFilters.savedFiltersError}
        searchQuery={params.searchQuery}
        selectMode={basket.selectMode}
        selectedBookIds={library.selectedBookIds}
        setActiveView={params.setActiveView}
        setAuthorFilter={params.setAuthorFilter}
        setDownloadOpen={() => {}}
        setSearchQuery={params.setSearchQuery}
        setSelectMode={basket.setSelectMode}
        setSelectedBook={openBook}
        setShelfFilter={params.setShelfFilter}
        setSortBy={params.setSortBy}
        setSortDir={params.setSortDir}
        setTagFilter={params.setTagFilter}
        shelfFilter={params.shelfFilter}
        shelfSummary={shelfSummary}
        shelves={shelves}
        showMergeUi={library.showMergeUi}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        tagFilter={params.tagFilter}
        toggleBasket={basket.toggleBasket}
        toggleBookSelection={library.toggleBookSelection}
        total={library.total}
      />
      <Outlet />
    </>
  );
}
