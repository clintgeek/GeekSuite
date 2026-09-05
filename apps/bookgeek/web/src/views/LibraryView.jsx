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
import React, { useState } from "react";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { GeekEmptyState, GeekErrorState, geekLayout } from "@geeksuite/ui";
import BookCard from "../components/BookCard";
import FilterSheet from "../components/FilterSheet";
import LibraryToolbar from "../components/LibraryToolbar";
import ShelfStrip from "../components/ShelfStrip";

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
  handleCreateDeviceBasket,
  handleMergeSelectedBooks,
  handleSaveCurrentFilter,
  hasMore,
  loadMoreRef,
  loading,
  loadingMore,
  mergeLoading,
  mergeSelectionError,
  onRetry,
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
  tagFilter,
  toggleBasket,
  toggleBookSelection,
  total,
}) {
  const [filterOpen, setFilterOpen] = useState(false);

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

      <LibraryToolbar
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
                    onOpen={(b) => {
                      setSelectedBook(b);
                      setDownloadOpen(false);
                    }}
                  />
                );
              })}
          </Box>
        )}

        {showMergeUi && mergeSelectionError ? (
          <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 1 }}>
            {mergeSelectionError}
          </Typography>
        ) : null}

        {hasMore && !loading && (
          <Box ref={loadMoreRef} sx={{ mt: 2, minHeight: 44 }}>
            {loadingMore ? (
              <Skeleton variant="rectangular" sx={{ height: 44, borderRadius: "8px" }} />
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
          {basketError ? (
            <Typography variant="caption" sx={{ color: "error.main", width: "100%" }}>
              {basketError}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
