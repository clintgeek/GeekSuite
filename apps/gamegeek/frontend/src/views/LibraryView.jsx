/**
 * The library (home): browse, filter, sort (DOCS/TAGS_AND_FILTERS.md §B2).
 *
 * All of its state is in the URL, read and written through
 * `useLibraryFilter()`. The same filter object feeds two queries:
 *   - `games(filter:…)`, one page at a time, infinite scroll (useGamePages;
 *     the pages merge in the cache, so an edit never collapses the list);
 *   - `gameFacets(filter)`, the counts beside every option (debounced).
 * The machinery is `@geeksuite/collection` (hooks/useLibrary.js binds it to
 * GameGeek's queries; utils/libraryFilter.js and utils/facets.js are the
 * config); this view lays it out around GameGeek's cards.
 * While either reloads, the previous answer stays on screen — results dim a
 * touch under a hairline progress bar instead of flashing to empty.
 *
 * md+: the filter panel column sits beside the grid (collapsible, remembered).
 * Phone: a "Filters · N" button opens the same sections in a full sheet, and
 * the shelf strip stays as the one-tap shelf switcher (the drawer is two taps
 * away, and "show me what I'm playing" is the phone's commonest question).
 *
 * The scroll position is remembered per view (useScrollMemory), so
 * coming back from Settings lands where the reader left.
 *
 * `/game/:id` and `/add` are child routes rendered into the <Outlet/>, so the
 * library stays mounted — pages, scroll and all — under the sheet.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, LinearProgress, Skeleton, useMediaQuery, useTheme } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GeekErrorState, useGeekPrimaryAction } from '@geeksuite/ui';
import { FilterPanel, FiltersSheet, LibraryHeader, useInfiniteSentinel, useScrollMemory, useSectionOpen } from '@geeksuite/collection';
import { useGameProfile, useShelfList, useShelfStats } from '../hooks/useGameMeta';
import { useGameFacets, useGamePages, useLibraryFilter } from '../hooks/useLibrary';
import { useRateGame } from '../hooks/useGameActions';
import { useScrollRoot } from '../components/AppMain';
import GameCard from '../components/GameCard';
import GameRow from '../components/GameRow';
import ShelfStrip from '../components/ShelfStrip';
import SaveLibraryView from '../components/SaveLibraryView';
import { gamePath, isFabVisible } from '../components/navConfig';
import { DEFAULT_OPEN, SECTIONS, SECTIONS_OPEN_KEY, activeChips } from '../utils/facets';
import { SORTS, isNarrowed, stateToParams } from '../utils/libraryFilter';
import { readPref, writePref } from '../utils/storage';
import LibraryEmpty from './LibraryEmpty';

const VIEW_KEY = 'gamegeek.libraryView';
const PANEL_KEY = 'gamegeek.filterPanel';
const SCROLL_KEY = 'gamegeek.libraryScroll';

const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(150px, 1fr))', sm: 'repeat(auto-fill, minmax(168px, 1fr))', lg: 'repeat(auto-fill, minmax(176px, 1fr))' },
  gap: { xs: 1.5, md: 2 },
};

function defaultPanelOpen() {
  try {
    return window.innerWidth >= 1200;
  } catch {
    return true;
  }
}

function SkeletonGrid() {
  return (
    <Box sx={GRID_SX} aria-busy="true" aria-label="Loading games">
      {Array.from({ length: 12 }, (_, i) => (
        <Box key={i} sx={{ p: 1, borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'background.card' }}>
          <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '3 / 4', borderRadius: '8px' }} />
          <Skeleton variant="text" sx={{ mt: 1, width: '80%', fontSize: '0.875rem' }} />
          <Skeleton variant="text" sx={{ width: '50%', fontSize: '0.75rem' }} />
        </Box>
      ))}
    </Box>
  );
}

export default function LibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const lib = useLibraryFilter();
  const { state } = lib;

  const [view, setView] = useState(() => (readPref(VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid'));
  const [panelOpen, setPanelOpen] = useState(() => {
    const stored = readPref(PANEL_KEY, null);
    return typeof stored === 'boolean' ? stored : defaultPanelOpen();
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sectionsOpen, toggleSection] = useSectionOpen(SECTIONS_OPEN_KEY, DEFAULT_OPEN);
  const filtersButtonRef = useRef(null);

  const shelves = useShelfList();
  const { stats } = useShelfStats();
  const { profile } = useGameProfile();
  const rate = useRateGame();
  const scrollRoot = useScrollRoot();
  const customShelves = useMemo(() => profile?.customShelves ?? [], [profile]);
  const facetContext = useMemo(() => ({ customShelves }), [customShelves]);

  const { page, games, hasMore, loading, refreshing, loadingMore, loadMore, error, refetch } = useGamePages(lib);
  const facets = useGameFacets(lib.filterInput);
  const total = page?.total ?? facets.current?.total ?? null;

  const sentinelRef = useInfiniteSentinel(loadMore, { enabled: hasMore, busy: loadingMore, root: scrollRoot });
  useScrollMemory(scrollRoot, stateToParams(state).toString(), { rows: games.length, hasMore, storageKey: SCROLL_KEY });

  const openGame = useCallback((game) => navigate(gamePath(game.id, location.search)), [navigate, location.search]);
  const openAdd = useCallback(() => navigate(`/add${location.search}`), [navigate, location.search]);

  useGeekPrimaryAction({ label: 'Add game', icon: <AddIcon />, onClick: openAdd, hidden: !isFabVisible(location.pathname) });

  const toggleView = () => {
    const next = view === 'list' ? 'grid' : 'list';
    setView(next);
    writePref(VIEW_KEY, next);
  };
  const setPanel = (open) => {
    setPanelOpen(open);
    writePref(PANEL_KEY, open);
  };

  const singleShelf = state.filter.shelves.length === 1 ? state.filter.shelves[0] : null;
  const allChips = activeChips(state, { customShelves });
  // On a phone the shelf strip already shows a single chosen shelf; a chip
  // saying the same thing underneath it is noise.
  const chips = !isDesktop && singleShelf ? allChips.filter((c) => c.id !== `shelves:${singleShelf}`) : allChips;
  const stripValue = state.filter.shelves.length === 0 ? 'all' : singleShelf;
  const showShelf = !singleShelf;
  const narrowed = isNarrowed(state);
  const firstLoad = !page && (loading || !lib.ready);

  let body;
  if (error && !page) {
    body = (
      <GeekErrorState
        title="The library didn't load"
        description="The game server didn't answer. Your games are fine — this is a connection problem."
        onRetry={() => refetch()}
        sx={{ py: 8 }}
      />
    );
  } else if (firstLoad) {
    body = <SkeletonGrid />;
  } else if (!games.length) {
    body = (
      <LibraryEmpty
        narrowed={narrowed}
        libraryEmpty={stats ? stats.total === 0 : !narrowed}
        shelf={narrowed && lib.activeCount === 1 && singleShelf ? singleShelf : 'all'}
        shelves={shelves}
        onAdd={openAdd}
        onClear={lib.clearAll}
        onImport={() => navigate('/settings#playnite')}
      />
    );
  } else if (view === 'list') {
    body = (
      <Box component="ul" aria-label="Games" sx={{ m: 0, p: 0, mx: { xs: -1, sm: 0 } }}>
        {games.map((g) => (
          <GameRow key={g.id} game={g} onOpen={openGame} onRate={rate} showShelf={showShelf} customShelves={customShelves} />
        ))}
      </Box>
    );
  } else {
    body = (
      <Box component="section" aria-label="Games" sx={GRID_SX}>
        {games.map((g) => (
          <GameCard key={g.id} game={g} onOpen={openGame} onRate={rate} showShelf={showShelf} customShelves={customShelves} />
        ))}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
        {isDesktop && panelOpen ? (
          <FilterPanel
            sections={SECTIONS}
            lib={lib}
            facets={facets}
            context={facetContext}
            open={sectionsOpen}
            onToggleSection={toggleSection}
            onHide={() => setPanel(false)}
          />
        ) : null}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!isDesktop ? (
            <Box sx={{ pt: 0.5 }}>
              <ShelfStrip
                shelves={shelves}
                stats={stats}
                value={stripValue}
                onChange={(id) => lib.update({ shelves: id === 'all' ? [] : [id] })}
              />
            </Box>
          ) : null}
          <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 12, md: 6 }, pt: { xs: 0.5, md: 2 }, maxWidth: 1400, mx: 'auto' }}>
            <LibraryHeader
              sorts={SORTS}
              isDesktop={isDesktop}
              total={total}
              lib={lib}
              chips={chips}
              panelOpen={panelOpen}
              onShowPanel={() => setPanel(true)}
              onOpenSheet={() => setSheetOpen(true)}
              filtersButtonRef={filtersButtonRef}
              onSave={() => setSaveOpen(true)}
              view={view}
              onToggleView={toggleView}
            />
            <Box sx={{ position: 'relative', mt: 1.5 }}>
              <LinearProgress
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  top: -8,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: 'transparent',
                  opacity: refreshing ? 1 : 0,
                  transition: 'opacity 160ms',
                  transitionDelay: refreshing ? '120ms' : '0ms',
                }}
              />
              <Box
                sx={{
                  transition: 'opacity 180ms ease',
                  transitionDelay: refreshing ? '150ms' : '0ms',
                  opacity: refreshing ? 0.6 : 1,
                }}
              >
                {body}
              </Box>
            </Box>
            {hasMore ? (
              <Box ref={sentinelRef} data-testid="library-sentinel" sx={{ display: 'grid', placeItems: 'center', py: 3, minHeight: 64 }}>
                {loadingMore ? <CircularProgress size={22} aria-label="Loading more games" /> : null}
              </Box>
            ) : null}
          </Box>
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
          sections={SECTIONS}
          lib={lib}
          facets={facets}
          context={facetContext}
          sectionsOpen={sectionsOpen}
          onToggleSection={toggleSection}
          total={total}
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

      <Outlet />
    </>
  );
}
