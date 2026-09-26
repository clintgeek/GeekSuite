/**
 * `/` — the library route. Wires the URL filter state (hooks/useLibraryParams,
 * `@geeksuite/collection`'s `useCollectionFilter` underneath), the cached
 * book list and the panel's counts (hooks/useLibrary), the What-next strip
 * (hooks/useWhatNext) and the session's basket into `LibraryView`.
 * `/book/:id` renders into the <Outlet/> over it, so opening a book never
 * unmounts the grid: the scroll position and every loaded page are still
 * there when the sheet closes.
 */
import React, { useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useToast } from "@geeksuite/ui";
import { bookPath } from "../components/navConfig";
import { useBookActions } from "../hooks/useBookActions";
import { useBookGeek } from "../hooks/useBookGeek";
import { useBookFacets, useLibrary } from "../hooks/useLibrary";
import { useLibraryParams } from "../hooks/useLibraryParams";
import { useWhatNext } from "../hooks/useWhatNext";
import LibraryView from "./LibraryView";

export default function LibraryRoute() {
  const params = useLibraryParams();
  const { lib } = params;
  const session = useBookGeek();
  const library = useLibrary({ lib });
  const facets = useBookFacets(lib.filterInput);
  const actions = useBookActions();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { basket, shelves, shelfSummary, rateBook } = session;

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
        {...whatNext}
        lib={lib}
        facets={facets}
        shelves={shelves}
        shelfSummary={shelfSummary}
        books={library.books}
        total={library.total}
        loading={library.loading}
        refreshing={library.refreshing}
        error={library.error}
        hasMore={library.hasMore}
        loadingMore={library.loadingMore}
        loadMoreError={library.loadMoreError}
        onLoadMore={library.loadMore}
        onRetry={library.onRetry}
        basketBookIds={basket.basketBookIds}
        basketError={basket.basketError}
        basketLoading={basket.basketLoading}
        clearBasket={basket.clearBasket}
        handleCreateDeviceBasket={basket.handleCreateDeviceBasket}
        selectMode={basket.selectMode}
        setSelectMode={basket.setSelectMode}
        toggleBasket={basket.toggleBasket}
        showMergeUi={library.showMergeUi}
        selectedBookIds={library.selectedBookIds}
        toggleBookSelection={library.toggleBookSelection}
        handleMergeSelectedBooks={library.handleMergeSelectedBooks}
        mergeLoading={library.mergeLoading}
        mergeSelectionError={library.mergeSelectionError}
        handleExportCsv={library.handleExportCsv}
        exportingCsv={library.exportingCsv}
        exportError={library.exportError}
        exportNotice={library.exportNotice}
        onRateBook={rateBook}
        setSelectedBook={openBook}
      />
      <Outlet />
    </>
  );
}
