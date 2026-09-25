/**
 * The "every edit jumps the library back to the top" regression (Chef,
 * 2026-09-25): an edit refetched GetGames, page 1 replaced the merged pages,
 * the list collapsed to 48 and the scroll container snapped to 0.
 *
 * These run the real hooks against a real InMemoryCache with the app's type
 * policies, over a link that records every operation it is asked for.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable, useQuery } from '@apollo/client';
import { installGamePolicies } from '../../graphql/cachePolicies';
import { GET_GAME_SHELVES } from '../../graphql/queries';
import { useGamePages } from '../../hooks/useGamePages';
import { useRateGame, useSetShelf } from '../../hooks/useGameActions';
import { refreshLibraryList } from '../../hooks/useRefreshLibraryList';
import { useDetailActions } from '../../views/detail/useDetailActions';
import { makeDetailGame, makeGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const TOTAL = 150;
const LIMIT = 48;
const ALL = Array.from({ length: TOTAL }, (_, i) => makeGame({ id: `g${i + 1}`, title: `Game ${String(i + 1).padStart(3, '0')}` }));
const deleted = [];
afterEach(() => {
  // Put back anything a delete took out of the fake server.
  while (deleted.length) {
    const g = deleted.pop();
    ALL.splice(Number(g.id.slice(1)) - 1, 0, g);
  }
});
const detail = (id, over = {}) => makeDetailGame({ id, title: ALL.find((g) => g.id === id)?.title ?? id, ...over });

function makeClient() {
  const ops = [];
  const respond = {
    GetGames: ({ page = 1, limit = LIMIT }) => ({
      games: { __typename: 'GamePage', games: ALL.slice((page - 1) * limit, page * limit), total: ALL.length, page, pages: Math.ceil(ALL.length / limit) },
    }),
    GetGameShelves: () => ({ gameShelves: { __typename: 'GameShelfStats', total: TOTAL, owned: TOTAL, unshelved: 0, shelves: [], platforms: [] } }),
    GetGameFacets: () => ({ gameFacets: null }),
    GetGame: ({ id }) => ({ game: detail(id) }),
    UpdateGame: ({ id, input }) => ({ updateGame: detail(id, input) }),
    SetGameState: ({ gameId, input }) => ({ setGameState: detail(gameId, { me: { ...detail(gameId).me, ...input } }) }),
    LogGameSession: ({ gameId }) => ({ logGameSession: detail(gameId) }),
    DeleteGame: ({ id }) => {
      const at = ALL.findIndex((g) => g.id === id);
      if (at >= 0) deleted.push(...ALL.splice(at, 1));
      return { deleteGame: { __typename: 'GameDeleteResult', success: true, message: null } };
    },
  };
  const link = new ApolloLink(
    (op) =>
      new Observable((obs) => {
        ops.push(op.operationName);
        const fn = respond[op.operationName];
        obs.next({ data: fn ? fn(op.variables) : {} });
        obs.complete();
      })
  );
  const client = new ApolloClient({ link, cache: new InMemoryCache() });
  installGamePolicies(client);
  return { client, ops };
}

const variables = (page) => ({ page, limit: LIMIT, sort: 'title', sortDir: 'asc' });

function mount(client) {
  const api = {};
  function Probe() {
    Object.assign(api, useGamePages({ variables }));
    useQuery(GET_GAME_SHELVES); // mounted app-wide by the sidebar
    api.detail = useDetailActions('g100');
    api.setShelf = useSetShelf();
    api.rate = useRateGame();
    return null;
  }
  renderWithProviders(<Probe />, { wrapper: ({ children }) => <ApolloProvider client={client}>{children}</ApolloProvider> });
  return api;
}

async function loadThreePages(api) {
  await waitFor(() => expect(api.games).toHaveLength(48));
  await act(() => api.loadMore());
  await waitFor(() => expect(api.games).toHaveLength(96));
  await act(() => api.loadMore());
  await waitFor(() => expect(api.games).toHaveLength(144));
}

describe('library pagination survives edits', () => {
  it('with 3 pages loaded, edits keep all 144 games and never refetch GetGames', async () => {
    const { client, ops } = makeClient();
    const api = mount(client);
    await loadThreePages(api);
    const before = ops.filter((o) => o === 'GetGames').length; // page 1, 2, 3

    await act(() => api.detail.updateGame({ title: 'Renamed' }));
    // The edited card updated in place, from the cache.
    expect(api.games.find((g) => g.id === 'g100').title).toBe('Renamed');
    await act(() => api.detail.logSession({ minutes: 30 }));
    await act(() => api.setShelf(api.games[99], 'finished', { quiet: true }));
    await act(() => api.rate(api.games[10], 4, { quiet: true }));

    expect(ops.filter((o) => o === 'GetGames').length).toBe(before);
    expect(api.games).toHaveLength(144);
    // The cheap aggregates still refresh.
    expect(ops).toContain('GetGameShelves');
  });

  it('delete evicts the game from the list without a refetch', async () => {
    const { client, ops } = makeClient();
    const api = mount(client);
    await loadThreePages(api);
    const before = ops.filter((o) => o === 'GetGames').length;
    await act(() => api.detail.deleteGame());
    await waitFor(() => expect(api.games).toHaveLength(143));
    expect(api.games.some((g) => g.id === 'g100')).toBe(false);
    expect(api.page.total).toBe(TOTAL - 1);
    expect(ops.filter((o) => o === 'GetGames').length).toBe(before);
  });

  it('a create refreshes the list in place: one request, every loaded row kept, the new game in', async () => {
    const { client, ops } = makeClient();
    const api = mount(client);
    await loadThreePages(api);
    ALL.unshift(makeGame({ id: 'g0', title: 'Game 000' }));
    try {
      const before = ops.filter((o) => o === 'GetGames').length;
      await act(() => refreshLibraryList(client, ''));
      expect(ops.filter((o) => o === 'GetGames').length).toBe(before + 1);
      await waitFor(() => expect(api.games[0].id).toBe('g0'));
      // Same number of rows as before (the refresh asks for exactly what was
      // loaded), shifted by the newcomer — nothing collapsed.
      expect(api.games).toHaveLength(144);
      expect(api.page.total).toBe(TOTAL + 1);
    } finally {
      ALL.shift();
    }
  });

  it('keeps paging from what is loaded after a delete (no gap, no duplicate)', async () => {
    const { client, ops } = makeClient();
    const api = mount(client);
    await loadThreePages(api);
    await act(() => api.detail.deleteGame());
    await waitFor(() => expect(api.games).toHaveLength(143));
    await act(() => api.loadMore());
    await waitFor(() => expect(api.games.map((g) => g.id)).toContain('g145'));
    const ids = api.games.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(144);
    expect(ops.filter((o) => o === 'GetGames')).toHaveLength(4);
  });
});

