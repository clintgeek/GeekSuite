/**
 * BookGeek library view — the book grid and everything that frames it.
 *
 * Rebuilt as the "Pocket Pass" library (DOCS/MOBILE_UI_PLAN.md §3.1):
 * shelf strip (phone) → one 44px sort/filter row → cover grid → load-more
 * sentinel, with sort/filter/overflow living in a single `GeekSheet` and the
 * "Add book" primary action out in the FAB. Search moved to the top bar, so
 * it is gone from here; the dev-facing status lines are gone with it.
 *
 * All state still lives in `App`; the only hook here is the sheet's open flag,
 * which nothing outside this view needs to read.
 */
import React, { useEffect, useState } from "react";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { GeekEmptyState, GeekErrorState, geekLayout, useToast } from "@geeksuite/ui";
import BookCard from "../components/BookCard";
import BookRow from "../components/BookRow";
import FilterSheet from "../components/FilterSheet";
import LibraryToolbar from "../components/LibraryToolbar";
import ShelfStrip from "../components/ShelfStrip";
import WhatNextShelf from "../components/WhatNextShelf";

/**
 * Grid or list, remembered per browser. A per-viewer convenience, so plain
 * localStorage — and wrapped, because a private window or blocked storage
 * throws, and the library must still render.
 */
const LAYOUT_KEY = "bookgeek.libraryLayout";
function readLayout() {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
function writeLayout(value) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, value);
  } catch {
    // Not remembered this time; the toggle still works.
  }
}

export default function LibraryView({
  activeView,
  applySavedFilter,
  authorFilter,
  basketBookIds,
  basketError,
  basketLoading,
  books,
  clearBasket,
  error,
  exportError,
  exportNotice,
  exportingCsv,
  handleCreateDeviceBasket,
  handleMergeSelectedBooks,
  handleExportCsv,
  handleSaveCurrentFilter,
  hasMore,
  loadMoreError,
  loadMoreRef,
  loading,
  loadingMore,
  mergeLoading,
  mergeSelectionError,
  onRetry,
  onStartReading,
  // (book, rating) => Promise<boolean>. App owns the list, so App saves; this
  // view only decides what to tell the person.
  onRateBook,
  saveFilterLoading,
  savedFilters,
  savedFiltersError,
  searchQuery,
  selectMode,
  selectedBookIds,
  setActiveView,
  setAuthorFilter,
  setDownloadOpen,
  setSearchQuery,
  setSelectMode,
  setSelectedBook,
  setShelfFilter,
  setSortBy,
  setSortDir,
  setTagFilter,
  shelfFilter,
  shelfSummary,
  shelves,
  showMergeUi,
  sortBy,
  sortDir,
  startingBookId = null,
  tagFilter,
  toggleBasket,
  toggleBookSelection,
  total,
  // The library assistant (AI idea #4). Off by default: `whatNextEnabled` is
  // the Settings switch, and App does not even send the query when it is off.
  whatNextEnabled = false,
  whatNextError = null,
  whatNextLoading = false,
  whatNextPicks,
  whatNextProvenance,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const { notify } = useToast();
  const [layout, setLayout] = useState(readLayout);

  const toggleLayout = () => {
    setLayout((prev) => {
      const next = prev === "list" ? "grid" : "list";
      writeLayout(next);
      return next;
    });
  };

  /**
   * Save a rating, and make a mis-tap cheap to undo.
   *
   * The change is already on screen (App applies it optimistically), so the
   * toast is not confirmation — it is the undo. On a grid you also tap to open
   * books and scroll with your thumb, and a stray tap that quietly changed a
   * rating you had set years ago is the failure worth guarding. A failed save
   * has already been rolled back by App; saying so is this view's job.
   */
  const handleRate = async (book, rating) => {
    if (!onRateBook) return;
    const previous = typeof book.rating === "number" && book.rating > 0 ? book.rating : null;
    const title = book.title || "this book";
    const ok = await onRateBook(book, rating);
    if (!ok) {
      notify(`Couldn't save the rating for ${ title }.`, { tone: "error" });
      return;
    }
    notify(`${ rating }★ · ${ title }`, {
      tone: "success",
      action: (
        <Button
          size="small"
          color="inherit"
          onClick={() => onRateBook({ ...book, rating }, previous)}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Undo
        </Button>
      ),
    });
  };

  // Selection-bar action results (merge, device basket): fire-and-forget
  // feedback on a bar that stays on screen regardless, so a toast rather than
  // a persistent inline caption (TODO_ORDER #15).
  useEffect(() => {
    if (mergeSelectionError) notify(mergeSelectionError, { tone: "error" });
  }, [mergeSelectionError, notify]);
  useEffect(() => {
    if (basketError) notify(basketError, { tone: "error" });
  }, [basketError, notify]);
  // The CSV export finishes after the sheet has closed, so its result needs a
  // surface that outlives the sheet. Both outcomes are reported — a failed
  // export that looked like a successful one is the pattern this suite has
  // had to fix repeatedly.
  useEffect(() => {
    if (exportError) notify(exportError, { tone: "error" });
  }, [exportError, notify]);
  useEffect(() => {
    if (exportNotice) notify(exportNotice, { tone: "success" });
  }, [exportNotice, notify]);

  const hasFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(authorFilter.trim()) ||
    Boolean(tagFilter.trim()) ||
    shelfFilter !== "all";

  // The shelf is shown by the strip and the drawer, so it is not counted here.
  const activeFilterCount =
    (authorFilter.trim() ? 1 : 0) + (tagFilter.trim() ? 1 : 0);

  const clearAllFilters = () => {
    setSearchQuery("");
    setAuthorFilter("");
    setTagFilter("");
    setShelfFilter("all");
  };

  // Select mode drives the *device basket*: that is the list
  // `handleCreateDeviceBasket` posts. Merge selection rides along when the
  // (currently disabled) merge UI is on.
  const selectionCount = basketBookIds.length;
  const selectionBarOpen = selectMode || selectionCount > 0;

  const isSelected = (bookId) =>
    basketBookIds.includes(bookId) ||
    (showMergeUi && selectedBookIds.includes(bookId));

  const handleToggleSelect = (bookId) => {
    toggleBasket(bookId);
    if (showMergeUi) toggleBookSelection(bookId);
  };

  const exitSelectMode = () => {
    setSelectMode?.(false);
    clearBasket();
  };

  return (
    <Box
      component="main"
      sx={{ display: activeView === "profile" ? "none" : "block" }}
    >
      {/* Full-bleed on a phone: the strip scrolls edge to edge inside the
          shell's page padding. */}
      <Box sx={{ mx: { xs: -2, md: -3 }, mb: 1 }}>
        <ShelfStrip
          shelves={shelves}
          shelfSummary={shelfSummary}
          shelfFilter={shelfFilter}
          setShelfFilter={setShelfFilter}
          setActiveView={setActiveView}
        />
      </Box>

      {whatNextEnabled ? (
        // Full-bleed like the shelf strip: the rail scrolls edge to edge
        // inside the shell's page padding and supplies its own gutters.
        <Box sx={{ mx: { xs: -2, md: -3 } }}>
          <WhatNextShelf
            picks={whatNextPicks}
            provenance={whatNextProvenance}
            loading={whatNextLoading}
            error={whatNextError}
            shelves={shelves}
            onOpen={(b) => {
              setSelectedBook(b);
              setDownloadOpen(false);
            }}
            onStartReading={onStartReading}
            startingBookId={startingBookId}
          />
        </Box>
      ) : null}

      <LibraryToolbar
        view={layout}
        onToggleView={toggleLayout}
        total={total}
        sortBy={sortBy}
        sortDir={sortDir}
        onOpenSort={() => setFilterOpen(true)}
        onOpenFilter={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        shelves={shelves}
        shelfFilter={shelfFilter}
        setShelfFilter={setShelfFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        authorFilter={authorFilter}
        setAuthorFilter={setAuthorFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
      />

      {/* Bottom padding clears the selection band, or the FAB on a phone. */}
      <Box sx={{ mt: 2, pb: selectionBarOpen ? 12 : { xs: 10, md: 0 } }}>
        {error && !loading ? (
          <GeekErrorState
            title="Could not load your library"
            description="The library API did not answer."
            error={error}
            onRetry={onRetry ? () => onRetry() : undefined}
          />
        ) : !loading && books.length === 0 ? (
          <GeekEmptyState
            title={hasFilters ? "Nothing matches these filters" : "No books here yet"}
            description={
              hasFilters
                ? "Try a different shelf, or clear what you have narrowed by."
                : "Add a book to start your library."
            }
            action={
              hasFilters ? (
                <Button variant="outlined" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : layout === "list" && !loading ? (
          <Box role="list" aria-label="Books" sx={{ borderTop: 1, borderColor: "divider" }}>
            {books.map((book) => {
              const bookId = book.id || book._id;
              return (
                <Box role="listitem" key={bookId}>
                  <BookRow
                    book={book}
                    shelves={shelves}
                    selectMode={selectMode}
                    selected={isSelected(bookId)}
                    onToggleSelect={handleToggleSelect}
                    onRate={onRateBook ? handleRate : undefined}
                    onOpen={(b) => {
                      setSelectedBook(b);
                      setDownloadOpen(false);
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                sm: "repeat(3, minmax(0, 1fr))",
                md: "repeat(4, minmax(0, 1fr))",
                lg: "repeat(5, minmax(0, 1fr))",
              },
            }}
          >
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                <Box key={i}>
                  <Skeleton
                    variant="rectangular"
                    sx={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "8px" }}
                  />
                  <Skeleton variant="text" sx={{ mt: 1, width: "85%" }} />
                  <Skeleton variant="text" sx={{ width: "60%" }} />
                </Box>
              ))
              : books.map((book) => {
                const bookId = book.id || book._id;
                return (
                  <BookCard
                    key={bookId}
                    book={book}
                    shelves={shelves}
                    selectMode={selectMode}
                    selected={isSelected(bookId)}
                    onToggleSelect={handleToggleSelect}
                    onRate={onRateBook ? handleRate : undefined}
                    onOpen={(b) => {
                      setSelectedBook(b);
                      setDownloadOpen(false);
                    }}
                  />
                );
              })}
          </Box>
        )}

        {hasMore && !loading && (
          <Box ref={loadMoreRef} sx={{ mt: 2, minHeight: 44 }}>
            {loadingMore ? (
              <Skeleton variant="rectangular" sx={{ height: 44, borderRadius: "8px" }} />
            ) : loadMoreError ? (
              // A failed *append* belongs here, next to the sentinel — not in
              // the full-page GeekErrorState above, which would replace the
              // shelf the user is already reading.
              <Typography variant="caption" sx={{ color: "error.main" }} role="status">
                {loadMoreError}
              </Typography>
            ) : null}
          </Box>
        )}
      </Box>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        total={total}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortDir={sortDir}
        setSortDir={setSortDir}
        authorFilter={authorFilter}
        setAuthorFilter={setAuthorFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        setShelfFilter={setShelfFilter}
        setSearchQuery={setSearchQuery}
        savedFilters={savedFilters}
        savedFiltersError={savedFiltersError}
        applySavedFilter={applySavedFilter}
        handleSaveCurrentFilter={handleSaveCurrentFilter}
        handleExportCsv={handleExportCsv}
        exportingCsv={exportingCsv}
        saveFilterLoading={saveFilterLoading}
        onEnterSelectMode={() => setSelectMode?.(true)}
        showMergeUi={showMergeUi}
        handleMergeSelectedBooks={handleMergeSelectedBooks}
        mergeLoading={mergeLoading}
        selectedBookIds={selectedBookIds}
      />

      {selectionBarOpen ? (
        <Box
          sx={(theme) => ({
            position: "fixed",
            // Sits over the content column only; the shell's nav is permanent
            // at `md`+ and keeps its own bottom edge.
            left: { xs: 0, md: `${ geekLayout.sidebarWidth }px` },
            right: 0,
            bottom: 0,
            zIndex: theme.zIndex.appBar,
            px: 2,
            pt: 1.5,
            pb: "calc(12px + env(safe-area-inset-bottom))",
            bgcolor: "background.paper",
            borderTop: `1px solid ${ theme.palette.divider }`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          })}
        >
          <Typography variant="body2" sx={{ color: "text.secondary", flex: 1, minWidth: 0 }}>
            {selectionCount} selected
          </Typography>
          <Button onClick={exitSelectMode}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateDeviceBasket}
            disabled={basketLoading || selectionCount === 0}
          >
            {basketLoading ? "Creating…" : "Download to device"}
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
