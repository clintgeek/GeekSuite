/**
 * The library (home). All of its state is in the URL (utils/librarySort.js);
 * this route reads it, asks the gateway for one page at a time, and renders
 * the shelf strip, toolbar, grid or list, and the sentinel that loads more.
 *
 * `/game/:id` and `/add` are child routes rendered into the <Outlet/>, so
 * the library stays mounted — pages, scroll and all — under the sheet.
 */
import React, { useCallback, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useQuery } from '@apollo/client';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GeekErrorState, useGeekPrimaryAction } from '@geeksuite/ui';
import { GET_GAMES } from '../graphql/queries';
import { useGameProfile, useShelfList, useShelfStats } from '../hooks/useGameMeta';
import { useInfiniteSentinel } from '../hooks/useInfiniteSentinel';
import { useRateGame } from '../hooks/useGameActions';
import { useScrollRoot } from '../components/AppMain';
import FilterSheet from '../components/FilterSheet';
import GameCard from '../components/GameCard';
import GameRow from '../components/GameRow';
import LibraryToolbar from '../components/LibraryToolbar';
import ShelfStrip from '../components/ShelfStrip';
import { gamePath, isFabVisible } from '../components/navConfig';
import { activeFilterCount, buildGamesVariables, readLibraryParams, writeLibraryParams } from '../utils/librarySort';
import { readPref, writePref } from '../utils/storage';
import LibraryEmpty from './LibraryEmpty';

const VIEW_KEY = 'gamegeek.libraryView';

export function mergeGamePages(prev, next) {
  if (!next?.games) return prev;
  const seen = new Set((prev?.games?.games ?? []).map((g) => g.id));
  const fresh = next.games.games.filter((g) => !seen.has(g.id));
  return { games: { ...next.games, games: [...(prev?.games?.games ?? []), ...fresh] } };
}

export default function LibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const state = readLibraryParams(params);
  const variables = buildGamesVariables(state);

  const [view, setView] = useState(() => (readPref(VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid'));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const shelves = useShelfList();
  const { stats } = useShelfStats();
  const { profile } = useGameProfile();
  const rate = useRateGame();
  const scrollRoot = useScrollRoot();

  const { data, loading, error, fetchMore, refetch } = useQuery(GET_GAMES, {
    variables,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const page = data?.games;
  const games = page?.games ?? [];
  const hasMore = Boolean(page && page.page < page.pages);

  const patch = useCallback(
    (p) => setParams((prev) => writeLibraryParams(prev, p), { replace: true }),
    [setParams]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchMore({
        variables: { ...variables, page: page.page + 1 },
        updateQuery: (prev, { fetchMoreResult }) => mergeGamePages(prev, fetchMoreResult),
      });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, fetchMore, variables, page]);

  const sentinelRef = useInfiniteSentinel(loadMore, { enabled: hasMore, busy: loadingMore, root: scrollRoot });

  const openGame = useCallback((game) => navigate(gamePath(game.id, location.search)), [navigate, location.search]);
  const openAdd = useCallback(() => navigate(`/add${location.search}`), [navigate, location.search]);

  useGeekPrimaryAction({ label: 'Add game', icon: <AddIcon />, onClick: openAdd, hidden: !isFabVisible(location.pathname) });

  const toggleView = () => {
    const next = view === 'list' ? 'grid' : 'list';
    setView(next);
    writePref(VIEW_KEY, next);
  };

  const customShelves = profile?.customShelves ?? [];
  const showShelf = state.shelf === 'all';
  const narrowed = Boolean(state.q.trim() || state.platform || state.owned !== 'all' || state.shelf !== 'all');
  const firstLoad = loading && !page;

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
    body = (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
        <CircularProgress size={28} aria-label="Loading games" />
      </Box>
    );
  } else if (!games.length) {
    body = (
      <LibraryEmpty
        narrowed={narrowed}
        libraryEmpty={stats ? stats.total === 0 : !narrowed}
        shelf={state.shelf}
        shelves={shelves}
        onAdd={openAdd}
        onClear={() => patch({ q: '', platform: '', owned: 'all', shelf: 'all' })}
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
      <Box
        component="section"
        aria-label="Games"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(150px, 1fr))', sm: 'repeat(auto-fill, minmax(168px, 1fr))', lg: 'repeat(auto-fill, minmax(180px, 1fr))' },
          gap: { xs: 1.5, md: 2 },
        }}
      >
        {games.map((g) => (
          <GameCard key={g.id} game={g} onOpen={openGame} onRate={rate} showShelf={showShelf} customShelves={customShelves} />
        ))}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ pt: { xs: 0.5, md: 0 } }}>
        <ShelfStrip shelves={shelves} stats={stats} value={state.shelf} onChange={(shelf) => patch({ shelf })} />
      </Box>
      <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 12, md: 6 }, pt: { xs: 0.5, md: 2.5 }, maxWidth: 1400, mx: 'auto' }}>
        <LibraryToolbar
          total={page?.total ?? null}
          state={state}
          filterCount={activeFilterCount(state)}
          onOpenSheet={() => setSheetOpen(true)}
          onPatch={patch}
          view={view}
          onToggleView={toggleView}
        />
        <Box sx={{ mt: 1.5 }}>{body}</Box>
        {hasMore ? (
          <Box ref={sentinelRef} data-testid="library-sentinel" sx={{ display: 'grid', placeItems: 'center', py: 3, minHeight: 64 }}>
            {loadingMore ? <CircularProgress size={22} aria-label="Loading more games" /> : null}
          </Box>
        ) : null}
      </Box>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        total={page?.total ?? null}
        state={state}
        platforms={stats?.platforms ?? []}
        onPatch={patch}
        onReset={() => patch({ sort: 'title', dir: 'asc', platform: '', owned: 'all' })}
      />

      <Outlet />
    </>
  );
}
