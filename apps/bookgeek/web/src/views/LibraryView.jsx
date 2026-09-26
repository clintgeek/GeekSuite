/**
 * BookGeek library view — the book grid and everything that frames it.
 *
 * Browsing is `@geeksuite/collection`'s, configured for books (Phase C2 of
 * DOCS/BOOKGEEK_CLEANUP_PLAN.md; utils/libraryFilter.js and utils/facets.js
 * are the config), the same machinery GameGeek's library runs on:
 *
 *   md+    the filter panel column beside the grid (collapsible, remembered),
 *          live counts beside every option, the active chips and sort above
 *          the list.
 *   phone  the shelf strip (one tap to a shelf — the question a phone asks
 *          most), then "Filters · N" opening the same sections in a full
 *          sheet with a "Show N books" footer.
 *
 * Search is in the top bar; "Add book" is the FAB. The list pages in behind a
 * sentinel and merges in the Apollo cache, so nothing an edit does collapses
 * it, and the scroll position is remembered per view (so coming back from
 * Settings, or Back onto a filter, lands where the reader left). While a new
 * filter loads, the previous rows stay on screen, dimmed under a hairline.
 *
 * State lives in the hooks `views/LibraryRoute.jsx` wires in (the list in the
 * Apollo cache, the filters in the URL); what is here is this view's own:
 * the panel/sheet/save flags and the grid/list layout.
 */
import React, { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, LinearProgress, Skeleton, Typography, useMediaQuery, useTheme } from "@mui/material";
import { GeekEmptyState, GeekErrorState, geekLayout, useToast } from "@geeksuite/ui";
import {
  FilterPanel,
  FiltersSheet,
  LibraryHeader,
  useInfiniteSentinel,
  useScrollMemory,
  useSectionOpen,
} from "@geeksuite/collection";
import BookCard from "../components/BookCard";
import BookRow from "../components/BookRow";
import LibraryActions from "../components/LibraryActions";
import SaveLibraryView from "../components/SaveLibraryView";
import ShelfStrip from "../components/ShelfStrip";
import WhatNextShelf from "../components/WhatNextShelf";
import { useScrollRoot } from "../components/AppMain";
import { DEFAULT_OPEN, SECTIONS_OPEN_KEY, activeChips, sectionsFor } from "../utils/facets";
import { SORTS, isNarrowed, stateToParams } from "../utils/libraryFilter";

const SCROLL_KEY = "bookgeek.libraryScroll";
const PANEL_KEY = "bookgeek.filterPanel";

/**
 * Grid or list, and the desktop panel shown or hidden — remembered per
 * browser. Per-viewer conveniences, so plain localStorage, wrapped: a private
 * window or blocked storage throws, and the library must still render.
 */
const LAYOUT_KEY = "bookgeek.libraryLayout";
function readPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered this time; the control still works.
  }
}
function defaultPanelOpen() {
  const stored = readPref(PANEL_KEY, null);
  if (stored === "1" || stored === "0") return stored === "1";
  try {
    return window.innerWidth >= 1200;
  } catch {
    return true;
  }
}

const GRID_SX = {
  display: "grid",
  gap: 1.5,
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    md: "repeat(auto-fill, minmax(150px, 1fr))",
  },
};

export default function LibraryView({
  lib,
  facets = { base: null, current: null },
  shelves,
  shelfSummary,
  books,
  total,
  loading,
  refreshing = false,
  error,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onRetry,
  basketBookIds,
  basketError,
  basketLoading,
  clearBasket,
  handleCreateDeviceBasket,
  selectMode,
  setSelectMode,
  toggleBasket,
  showMergeUi,
  selectedBookIds,
  toggleBookSelection,
  handleMergeSelectedBooks,
  mergeLoading,
  mergeSelectionError,
  handleExportCsv,
  exportingCsv,
  exportError,
  exportNotice,
  onStartReading,
  // (book, rating) => Promise<boolean>. The session saves (hooks/useBookActions useRateBook); this
  // view only decides what to tell the person.
  onRateBook,
  setSelectedBook,
  startingBookId = null,
  // The library assistant (AI idea #4). Off by default: `whatNextEnabled` is
  // the Settings switch, and the route does not even send the query when it is off.
  whatNextEnabled = false,
  whatNextError = null,
  whatNextLoading = false,
  whatNextPicks,
  whatNextProvenance,
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { notify } = useToast();
  const scrollRoot = useScrollRoot();
  const { state } = lib;

  const [layout, setLayout] = useState(() => (readPref(LAYOUT_KEY, "grid") === "list" ? "list" : "grid"));
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sectionsOpen, toggleSection] = useSectionOpen(SECTIONS_OPEN_KEY, DEFAULT_OPEN);
  const filtersButtonRef = useRef(null);

  const context = { shelves };
  const sections = sectionsFor(facets, state.filter);

  const sentinelRef = useInfiniteSentinel(onLoadMore, { enabled: Boolean(hasMore) && !loading, busy: loadingMore, root: scrollRoot });
  useScrollMemory(scrollRoot, stateToParams(state).toString(), { rows: books.length, hasMore, storageKey: SCROLL_KEY });

  const toggleLayout = () => {
    setLayout((prev) => {
      const next = prev === "list" ? "grid" : "list";
      writePref(LAYOUT_KEY, next);
      return next;
    });
  };
  const setPanel = (open) => {
    setPanelOpen(open);
    writePref(PANEL_KEY, open ? "1" : "0");
  };

  /**
   * Save a rating, and make a mis-tap cheap to undo.
   *
   * The change is already on screen (applied optimistically in the cache), so the
   * toast is not confirmation — it is the undo. On a grid you also tap to open
   * books and scroll with your thumb, and a stray tap that quietly changed a
   * rating you had set years ago is the failure worth guarding. A failed save
   * has already been rolled back in the cache; saying so is this view's job.
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
  // The CSV export finishes after the menu has closed, so its result needs a
  // surface that outlives it. Both outcomes are reported — a failed export
  // that looked like a successful one is the pattern this suite has had to
  // fix repeatedly.
  useEffect(() => {
    if (exportError) notify(exportError, { tone: "error" });
  }, [exportError, notify]);
  useEffect(() => {
    if (exportNotice) notify(exportNotice, { tone: "success" });
  }, [exportNotice, notify]);

  const narrowed = isNarrowed(state);
  const allChips = activeChips(state, context);
  // On a phone the shelf strip already shows a single chosen shelf; a chip
  // saying the same thing underneath it is noise.
  const singleShelf = state.filter.shelves.length === 1 ? state.filter.shelves[0] : null;
  const chips = !isDesktop && singleShelf ? allChips.filter((c) => c.id !== `shelves:${ singleShelf }`) : allChips;
  const stripValue = state.filter.shelves.length === 0 ? "all" : singleShelf;
  const shownTotal = total ?? facets.current?.total ?? null;

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

  const openBook = (b) => setSelectedBook(b);

  const actions = (
    <LibraryActions
      view={layout}
      onToggleView={isDesktop ? undefined : toggleLayout}
      onExportCsv={handleExportCsv}
      exportingCsv={exportingCsv}
      onSelectBooks={() => setSelectMode?.(true)}
      showMergeUi={showMergeUi}
      onMerge={handleMergeSelectedBooks}
      mergeLoading={mergeLoading}
      mergeCount={selectedBookIds?.length ?? 0}
    />
  );

  let body;
  if (error && !loading) {
    body = (
      <GeekErrorState
        title="Could not load your library"
        description="The library API did not answer."
        error={error}
        onRetry={onRetry ? () => onRetry() : undefined}
      />
    );
  } else if (loading) {
    body = (
      <Box sx={GRID_SX} aria-busy="true" aria-label="Loading books">
        {Array.from({ length: 8 }).map((_, i) => (
          <Box key={i}>
            <Skeleton variant="rectangular" sx={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "8px" }} />
            <Skeleton variant="text" sx={{ mt: 1, width: "85%" }} />
            <Skeleton variant="text" sx={{ width: "60%" }} />
          </Box>
        ))}
      </Box>
    );
  } else if (books.length === 0) {
    body = (
      <GeekEmptyState
        title={narrowed ? "Nothing matches these filters" : "No books here yet"}
        description={
          narrowed ? "Try a different shelf, or clear what you have narrowed by." : "Add a book to start your library."
        }
        action={
          narrowed ? (
            <Button variant="outlined" onClick={lib.clearAll}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  } else if (layout === "list") {
    body = (
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
                onOpen={openBook}
              />
            </Box>
          );
        })}
      </Box>
    );
  } else {
    body = (
      <Box sx={GRID_SX}>
        {books.map((book) => {
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
              onOpen={openBook}
            />
          );
        })}
      </Box>
    );
  }

  return (
    <Box component="section" aria-label="Library" sx={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}>
      {isDesktop && panelOpen ? (
        <FilterPanel
          sections={sections}
          lib={lib}
          facets={facets}
          context={context}
          open={sectionsOpen}
          onToggleSection={toggleSection}
          onHide={() => setPanel(false)}
        />
      ) : null}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {!isDesktop ? (
          <ShelfStrip shelves={shelves} shelfSummary={shelfSummary} value={stripValue} onChange={(id) => lib.update({ shelves: id === "all" ? [] : [id] })} />
        ) : null}

        {whatNextEnabled ? (
          // Full-bleed: the rail scrolls edge to edge and supplies its own gutters.
          <WhatNextShelf
            picks={whatNextPicks}
            provenance={whatNextProvenance}
            loading={whatNextLoading}
            error={whatNextError}
            shelves={shelves}
            onOpen={openBook}
            onStartReading={onStartReading}
            startingBookId={startingBookId}
          />
        ) : null}

        {/* Bottom padding clears the selection band, or the FAB on a phone. */}
        <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 0.5, md: 2 }, pb: selectionBarOpen ? 12 : { xs: 12, md: 6 }, maxWidth: 1200, mx: "auto" }}>
          <LibraryHeader
            sorts={SORTS}
            isDesktop={isDesktop}
            total={shownTotal}
            lib={lib}
            chips={chips}
            panelOpen={panelOpen}
            onShowPanel={() => setPanel(true)}
            onOpenSheet={() => setSheetOpen(true)}
            filtersButtonRef={filtersButtonRef}
            onSave={() => setSaveOpen(true)}
            view={layout}
            onToggleView={isDesktop ? toggleLayout : undefined}
            actions={actions}
          />

          <Box sx={{ position: "relative", mt: 2 }}>
            <LinearProgress
              aria-hidden="true"
              sx={{
                position: "absolute",
                top: -8,
                left: 0,
                right: 0,
                height: 2,
                borderRadius: 1,
                bgcolor: "transparent",
                opacity: refreshing ? 1 : 0,
                transition: "opacity 160ms",
                transitionDelay: refreshing ? "120ms" : "0ms",
              }}
            />
            <Box sx={{ transition: "opacity 180ms ease", transitionDelay: refreshing ? "150ms" : "0ms", opacity: refreshing ? 0.6 : 1 }}>
              {body}
            </Box>
          </Box>

          {hasMore && !loading ? (
            <Box ref={sentinelRef} data-testid="library-sentinel" sx={{ display: "grid", placeItems: "center", mt: 2, minHeight: 64 }}>
              {loadingMore ? (
                <CircularProgress size={22} aria-label="Loading more books" />
              ) : loadMoreError ? (
                // A failed *append* belongs here, next to the sentinel — not in
                // the full-page GeekErrorState above, which would replace the
                // shelf the user is already reading.
                <Typography variant="caption" sx={{ color: "error.main" }} role="status">
                  {loadMoreError}
                </Typography>
              ) : null}
            </Box>
          ) : null}
        </Box>
      </Box>

      {!isDesktop ? (
        <FiltersSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
            // MUI's modal restores focus on exit; this is the belt for a
            // close that races the transition (Escape mid-slide).
            requestAnimationFrame(() => filtersButtonRef.current?.focus());
          }}
          sections={sections}
          lib={lib}
          facets={facets}
          context={context}
          sectionsOpen={sectionsOpen}
          onToggleSection={toggleSection}
          total={shownTotal}
        />
      ) : null}

      <SaveLibraryView
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        filterInput={lib.filterInput}
        sort={state.sort}
        dir={state.dir}
        chips={allChips}
      />

      {selectionBarOpen ? (
        <Box
          sx={(t) => ({
            position: "fixed",
            // Sits over the content column only; the shell's nav is permanent
            // at `md`+ and keeps its own bottom edge.
            left: { xs: 0, md: `${ geekLayout.sidebarWidth }px` },
            right: 0,
            bottom: 0,
            zIndex: t.zIndex.appBar,
            px: 2,
            pt: 1.5,
            pb: "calc(12px + env(safe-area-inset-bottom))",
            bgcolor: "background.paper",
            borderTop: `1px solid ${ t.palette.divider }`,
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
