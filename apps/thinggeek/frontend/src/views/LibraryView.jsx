/**
 * The library (home): browse, filter, sort.
 *
 * All of its state is in the URL (`useLibraryFilter()`, the codec in
 * utils/libraryFilter.js). The same filter feeds two queries:
 *   - `things(filter:…)`, a page at a time, infinite scroll (the pages merge
 *     in the cache, so an edit never collapses the list);
 *   - `thingFacets(filter)`, the counts beside every option (debounced).
 * The machinery is `@geeksuite/collection`; this view lays it out around
 * ThingGeek's cards. While either reloads, the previous answer stays on
 * screen, dimmed a touch under a hairline progress bar.
 *
 * md+: the filter panel column beside the grid (collapsible, remembered).
 * Phone: a "Filters · N" button opens the same sections in a full sheet.
 *
 * Phone first: the default is the dense LIST — the cargo hold's manifest on
 * a box-face panel under a heavy black rule; the photo grid (boxes on
 * pallets) is the toggle beside Sort, and the choice is
 * remembered (utils/storage.js — try/catch, a convenience). Desktop defaults
 * to the grid. A thing and the add screen are pages of their own; coming
 * back, useScrollMemory puts the list where it was.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, LinearProgress, Skeleton, useMediaQuery, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekErrorState } from '@geeksuite/ui';
import { FilterPanel, FiltersSheet, LibraryHeader, useInfiniteSentinel, useScrollMemory, useSectionOpen } from '@geeksuite/collection';
import { useLibraryFilter, useThingFacets, useThingPages } from '../hooks/useLibrary';
import { useFacetContext, useThingTree } from '../hooks/useThingMeta';
import { useScrollRoot } from '../components/AppMain';
import ThingCard from '../components/ThingCard';
import ThingRow, { ListHeader } from '../components/ThingRow';
import SaveLibraryView from '../components/SaveLibraryView';
import { thingPath } from '../components/navConfig';
import { DEFAULT_OPEN, SECTIONS, SECTIONS_OPEN_KEY, activeChips } from '../utils/facets';
import { dustImage } from '../theme/theme';
import { SORTS, isNarrowed, stateToParams } from '../utils/libraryFilter';
import { readPref, writePref } from '../utils/storage';
import { isNotMemberError, reportNotMember } from '../membership';
import { rememberLibrarySearch } from '../utils/lastLibrary';
import { bySiblingOrder, isParentKind, kindOf } from '../utils/where';
import LibraryEmpty from './LibraryEmpty';

const VIEW_KEY = 'thinggeek.libraryView';
const PANEL_KEY = 'thinggeek.filterPanel';
const SCROLL_KEY = 'thinggeek.libraryScroll';

export const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(150px, 1fr))', sm: 'repeat(auto-fill, minmax(190px, 1fr))', lg: 'repeat(auto-fill, minmax(210px, 1fr))' },
  columnGap: { xs: 1.5, md: 2 },
  rowGap: { xs: 2, md: 3 },
};

/** No stored choice: the list on a phone, the grid on a desk. */
export function defaultLibraryView() {
  try {
    return window.matchMedia('(min-width: 900px)').matches ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

export function initialLibraryView() {
  const stored = readPref(VIEW_KEY, null);
  return stored === 'list' || stored === 'grid' ? stored : defaultLibraryView();
}

function defaultPanelOpen() {
  try {
    return window.innerWidth >= 1200;
  } catch {
    return true;
  }
}

function SkeletonGrid() {
  return (
    <Box sx={GRID_SX} aria-busy="true" aria-label="Loading things">
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} sx={{ p: 1, borderRadius: '4px', border: 1, borderColor: 'divider', bgcolor: 'background.card' }}>
          <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '4 / 3', borderRadius: '2px' }} />
          <Skeleton variant="text" sx={{ mt: 1, width: '80%', fontSize: '0.9375rem' }} />
          <Skeleton variant="text" sx={{ width: '55%', fontSize: '0.75rem' }} />
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

  const [view, setView] = useState(initialLibraryView);
  const [panelOpen, setPanelOpen] = useState(() => {
    const stored = readPref(PANEL_KEY, null);
    return typeof stored === 'boolean' ? stored : defaultPanelOpen();
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sectionsOpen, toggleSection] = useSectionOpen(SECTIONS_OPEN_KEY, DEFAULT_OPEN);
  const filtersButtonRef = useRef(null);
  const scrollRoot = useScrollRoot();
  const facetContext = useFacetContext();
  const { nodes: treeNodes } = useThingTree();
  // The household's top places (Chef's shape: rooms set up, nothing in them), for the first run.
  const rooms = React.useMemo(() => treeNodes.filter((n) => isParentKind(kindOf(n))).sort(bySiblingOrder).slice(0, 12), [treeNodes]);

  const { page, things, hasMore, loading, refreshing, loadingMore, loadMore, error, refetch } = useThingPages(lib);
  const facets = useThingFacets(lib.filterInput);
  const total = page?.total ?? facets.current?.total ?? null;
  useEffect(() => {
    if (isNotMemberError(error)) reportNotMember();
  }, [error]);
  // The insurance report offers "just what the library is showing".
  useEffect(() => rememberLibrarySearch(location.search), [location.search]);

  const sentinelRef = useInfiniteSentinel(loadMore, { enabled: hasMore, busy: loadingMore, root: scrollRoot });
  useScrollMemory(scrollRoot, stateToParams(state).toString(), { rows: things.length, hasMore, storageKey: SCROLL_KEY });

  const openThing = useCallback((thing) => navigate(thingPath(thing.id, location.search)), [navigate, location.search]);
  const openAdd = useCallback(() => navigate(`/add${location.search}`), [navigate, location.search]);


  const toggleView = () => {
    const next = view === 'list' ? 'grid' : 'list';
    setView(next);
    writePref(VIEW_KEY, next);
  };
  const setPanel = (open) => {
    setPanelOpen(open);
    writePref(PANEL_KEY, open);
  };

  const chips = activeChips(state, facetContext);
  const narrowed = isNarrowed(state);
  const firstLoad = !page && (loading || !lib.ready);
  const householdEmpty = facets.base ? facets.base.total === 0 : !narrowed && page?.total === 0;

  let body;
  if (error && !page) {
    body = (
      <GeekErrorState
        title="The library didn't load"
        description="The server didn't answer. Your records are fine — this is a connection problem."
        onRetry={() => refetch()}
        sx={{ py: 8 }}
      />
    );
  } else if (firstLoad) {
    body = <SkeletonGrid />;
  } else if (!things.length) {
    body = <LibraryEmpty firstRun={householdEmpty && !narrowed} onAdd={openAdd} onClear={lib.clearAll} rooms={rooms} />;
  } else if (view === 'list') {
    body = (
      <Box
        data-testid="thing-list"
        sx={{
          mx: { xs: -0.5, sm: 0 },
          bgcolor: 'background.card',
          backgroundImage: (t) => dustImage(t.palette.mode),
          border: 1,
          borderColor: 'border',
          // the hold's heavy black rule across the top
          borderTop: '4px solid',
          borderTopColor: 'rule.main',
          borderRadius: '3px',
          overflow: 'hidden',
          boxShadow: (t) => (t.palette.mode === 'dark' ? '0 3px 0 rgba(0,0,0,0.6)' : '0 3px 0 rgba(60,38,14,0.22)'),
        }}
      >
        <ListHeader />
        <Box component="ul" aria-label="Things" sx={{ m: 0, p: 0 }}>
          {things.map((t) => (
            <ThingRow key={t.id} thing={t} onOpen={openThing} />
          ))}
        </Box>
      </Box>
    );
  } else {
    body = (
      <Box component="section" aria-label="Things" sx={GRID_SX}>
        {things.map((t) => (
          <ThingCard key={t.id} thing={t} onOpen={openThing} />
        ))}
      </Box>
    );
  }

  // First run: no chrome to filter nothing with — just the welcome.
  const bare = !firstLoad && !things.length && householdEmpty && !narrowed;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
        {isDesktop && panelOpen && !bare ? (
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
          <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 4, md: 6 }, pt: { xs: 1.5, md: 2 }, maxWidth: 1400, mx: 'auto' }}>
            {bare ? null : (
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
            )}
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
                  overflow: 'hidden',
                  opacity: refreshing ? 1 : 0,
                  transition: 'opacity 160ms',
                  transitionDelay: refreshing ? '120ms' : '0ms',
                }}
              />
              <Box sx={{ transition: 'opacity 180ms ease', transitionDelay: refreshing ? '150ms' : '0ms', opacity: refreshing ? 0.6 : 1 }}>
                {body}
              </Box>
            </Box>
            {hasMore ? (
              <Box ref={sentinelRef} data-testid="library-sentinel" sx={{ display: 'grid', placeItems: 'center', py: 3, minHeight: 64 }}>
                {loadingMore ? <CircularProgress size={22} aria-label="Loading more things" /> : null}
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

      <SaveLibraryView open={saveOpen} onClose={() => setSaveOpen(false)} filterInput={lib.filterInput} sort={state.sort} dir={state.dir} chips={chips} />
    </>
  );
}
