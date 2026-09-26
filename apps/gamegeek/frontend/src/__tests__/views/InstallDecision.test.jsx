/**
 * "Not installed anymore — how did it end?" (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md
 * §Installed → Playing): the detail banner, its optimistic answers with an
 * Undo toast, the Cleanup filter row, the copy's "Installed" mark and the
 * Settings preview line.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { InMemoryCache, useQuery } from '@apollo/client';
import InstallDecisionBanner from '../../views/detail/InstallDecisionBanner';
import CopiesSection from '../../views/detail/CopiesSection';
import FilterSections from '../../components/filters/FilterSections';
import PlaynitePreview from '../../views/settings/PlaynitePreview';
import { dropStatusMessage } from '../../views/settings/PlayniteImportCard';
import { useResolveInstallFlag } from '../../hooks/useGameActions';
import { GET_GAME } from '../../graphql/queries';
import { RESOLVE_INSTALL_FLAG } from '../../graphql/mutations';
import { GAME_TYPE_POLICIES } from '../../graphql/cachePolicies';
import { createResolveInstallFlag, isFlagged, patchFor } from '../../utils/installDecision';
import { activeChips, DEFAULT_OPEN } from '../../utils/facets';
import { DEFAULT_STATE, EMPTY_FILTER, readLibraryState, stateToParams, toFilterInput } from '../../utils/libraryFilter';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const flaggedGame = (over = {}) => {
  const g = makeDetailGame();
  return {
    ...g,
    copies: [{ ...g.copies[0], id: 'c1', platform: 'pc', format: 'digital', storefront: 'epic', fromPlaynite: true, playtimeHours: 3, installed: false }],
    me: { ...g.me, shelf: 'playing', installFlag: 'uninstalled', installFlagAt: '2026-09-25T12:00:00.000Z' },
    ...over,
  };
};

describe('createResolveInstallFlag — optimistic, rolled back on failure', () => {
  it('applies the answer at once and keeps it when the save lands', async () => {
    const apply = vi.fn();
    const save = vi.fn().mockResolvedValue({ id: 'g1' });
    const resolve = createResolveInstallFlag({ save, apply });
    const res = await resolve(flaggedGame(), 'finished');
    expect(res.ok).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('g1', { shelf: 'finished', installFlag: null, installFlagAt: null });
    expect(save).toHaveBeenCalledWith('g1', 'finished');
  });

  it('puts back exactly what was there when the save fails', async () => {
    const apply = vi.fn();
    const resolve = createResolveInstallFlag({ save: vi.fn().mockRejectedValue(new Error('offline')), apply });
    const res = await resolve(flaggedGame(), 'abandoned');
    expect(res.ok).toBe(false);
    expect(apply).toHaveBeenLastCalledWith('g1', { shelf: 'playing', installFlag: 'uninstalled', installFlagAt: '2026-09-25T12:00:00.000Z' });
  });

  it('still-playing keeps Playing; undo restores the flag', () => {
    expect(patchFor('still-playing')).toEqual({ shelf: 'playing', installFlag: null, installFlagAt: null });
    expect(patchFor('on-hold')).toEqual({ shelf: 'on-hold', installFlag: null, installFlagAt: null });
    expect(patchFor('undo')).toEqual({ shelf: 'playing', installFlag: 'uninstalled' });
    expect(isFlagged(flaggedGame())).toBe(true);
    expect(isFlagged(makeDetailGame())).toBe(false);
  });
});

describe('InstallDecisionBanner', () => {
  it('asks the question with four answers, each carrying its taste-model meaning', () => {
    const onResolve = vi.fn();
    renderWithProviders(<InstallDecisionBanner game={flaggedGame()} onResolve={onResolve} />);
    const banner = screen.getByRole('region', { name: 'Not installed anymore — how did it end?' });
    const names = within(banner).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Finished — Got what I wanted out of it — a restart would be a fresh start',
      'On hold — Played it; haven’t admitted I’ve abandoned it yet',
      'Abandoned — Abandoned is abandoned',
      'Still playing — Keep it on Playing — no more asking until it’s reinstalled and removed again',
    ]);
    expect(within(banner).getByText('Abandoned is abandoned')).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole('button', { name: /^On hold/ }));
    fireEvent.click(within(banner).getByRole('button', { name: /^Still playing/ }));
    expect(onResolve.mock.calls.map((c) => c[0])).toEqual(['on-hold', 'still-playing']);
  });
});

/** The real hook against a real cache: answer → optimistic → mutation → toast → Undo → mutation. */
function DecisionHarness() {
  const { data } = useQuery(GET_GAME, { variables: { id: 'g1' }, fetchPolicy: 'cache-only' });
  const resolve = useResolveInstallFlag();
  const game = data?.game;
  if (!game) return null;
  return (
    <>
      <p data-testid="shelf">{game.me?.shelf}</p>
      {isFlagged(game) ? <InstallDecisionBanner game={game} onResolve={(a) => resolve(game, a)} /> : <p>answered</p>}
    </>
  );
}

describe('answering from the detail sheet', () => {
  function setup(first, { failFirst = false } = {}) {
    const cache = new InMemoryCache({ typePolicies: GAME_TYPE_POLICIES });
    cache.writeQuery({ query: GET_GAME, variables: { id: 'g1' }, data: { game: flaggedGame() } });
    const answered = flaggedGame({ me: { ...flaggedGame().me, shelf: first === 'still-playing' ? 'playing' : first, installFlag: null, installFlagAt: null } });
    const calls = [];
    const mocks = [
      {
        request: { query: RESOLVE_INSTALL_FLAG, variables: { gameId: 'g1', action: first } },
        delay: 300, // long enough to see the optimistic write land first
        ...(failFirst ? { error: new Error('offline') } : { result: () => (calls.push(first), { data: { resolveInstallFlag: answered } }) }),
      },
      {
        request: { query: RESOLVE_INSTALL_FLAG, variables: { gameId: 'g1', action: 'undo' } },
        result: () => (calls.push('undo'), { data: { resolveInstallFlag: flaggedGame() } }),
      },
    ];
    const Wrapper = ({ children }) => (
      <MockedProvider mocks={mocks} cache={cache}>
        {children}
      </MockedProvider>
    );
    renderWithProviders(<DecisionHarness />, { wrapper: Wrapper });
    return { calls };
  }

  it('Finished: the banner goes at once, the toast says so, and Undo brings the question back', async () => {
    const { calls } = setup('finished');
    fireEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    // Optimistic: gone before the server answers.
    expect(await screen.findByText('answered')).toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(screen.getByTestId('shelf')).toHaveTextContent('finished');
    await waitFor(() => expect(calls).toEqual(['finished']));

    const toast = await screen.findByText('Hades → Finished');
    const undo = within(toast.closest('[role="status"], [role="alert"]') ?? document.body).getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    expect(await screen.findByRole('region', { name: 'Not installed anymore — how did it end?' })).toBeInTheDocument();
    expect(screen.getByTestId('shelf')).toHaveTextContent('playing');
    await waitFor(() => expect(calls).toEqual(['finished', 'undo']));
  });

  it('Still playing: stays on Playing, the banner goes', async () => {
    const { calls } = setup('still-playing');
    fireEvent.click(screen.getByRole('button', { name: /^Still playing/ }));
    expect(await screen.findByText('answered')).toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(screen.getByTestId('shelf')).toHaveTextContent('playing');
    await waitFor(() => expect(calls).toEqual(['still-playing']));
    expect(await screen.findByText('Hades stays on Playing.')).toBeInTheDocument();
  });

  it('a failed save puts the banner back and says so', async () => {
    setup('abandoned', { failFirst: true });
    fireEvent.click(screen.getByRole('button', { name: /^Abandoned/ }));
    expect(await screen.findByText("Couldn't save that for Hades.")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Not installed anymore — how did it end?' })).toBeInTheDocument();
    expect(screen.getByTestId('shelf')).toHaveTextContent('playing');
  });
});

describe('the Cleanup filter: "Not installed anymore (N)"', () => {
  const lib = (filter = {}) => ({ state: { ...DEFAULT_STATE, filter: { ...EMPTY_FILTER, ...filter } }, toggle: vi.fn(), update: vi.fn() });
  const facets = { total: 40, metadata: [{ value: 'no-match', count: 2 }], needsDecision: 3 };

  it('shows the count on the switch and in the closed section heading; toggling filters', () => {
    const l = lib();
    const { rerender } = renderWithProviders(
      <FilterSections lib={l} facets={{ base: facets, current: facets }} open={{ ...DEFAULT_OPEN, metadata: true }} onToggleSection={() => {}} />
    );
    const row = screen.getByRole('checkbox', { name: 'Not installed anymore, 3 games' });
    fireEvent.click(row);
    expect(l.update).toHaveBeenCalledWith({ needsDecision: true });
    expect(screen.getByRole('group', { name: 'Metadata' })).toBeInTheDocument();

    rerender(<FilterSections lib={l} facets={{ base: facets, current: facets }} open={{}} onToggleSection={() => {}} />);
    expect(screen.getByRole('button', { name: /^Cleanup/ })).toHaveTextContent('3 not installed anymore');
  });

  it('round-trips through the URL, reaches GameFilterInput, and has a removable chip', () => {
    const state = readLibraryState(new URLSearchParams('decide=1'));
    expect(state.filter.needsDecision).toBe(true);
    expect(stateToParams(state).toString()).toBe('decide=1');
    expect(toFilterInput(state.filter)).toEqual({ needsDecision: true });
    expect(readLibraryState(new URLSearchParams('decide=0')).filter.needsDecision).toBeNull();
    const chip = activeChips(state).find((c) => c.id === 'needsDecision');
    expect(chip).toMatchObject({ group: 'Cleanup', label: 'Not installed anymore', patch: { needsDecision: null } });
  });
});

describe('copies and Settings', () => {
  it('an installed Playnite copy says "Installed"; an uninstalled or manual one does not', () => {
    renderWithProviders(
      <CopiesSection
        copies={[
          { id: 'a', platform: 'pc', format: 'digital', storefront: 'epic', fromPlaynite: true, installed: true },
          { id: 'b', platform: 'pc', format: 'digital', storefront: 'gog', fromPlaynite: true, installed: false },
          { id: 'c', platform: 'switch', format: 'physical', storefront: 'retail', fromPlaynite: false, installed: null },
        ]}
        onEdit={() => {}}
      />
    );
    expect(screen.getAllByText('· Installed')).toHaveLength(1);
  });

  it('the dry run preview and the auto-import line report moves and flags when there are any', () => {
    const preview = {
      total: 3,
      counts: { create: 0, addCopy: 0, update: 2, unchanged: 1, skippedHidden: 0, notInFile: 0, invalid: 0, movedToPlaying: 2, flaggedUninstalled: 1 },
      samples: {},
    };
    renderWithProviders(<PlaynitePreview preview={preview} />);
    expect(screen.getByTestId('playnite-install-summary')).toHaveTextContent(
      '2 installed games move to Playing. 1 Playing game is not installed anymore — it stays on Playing and asks how it ended.'
    );
    const line = dropStatusMessage({
      enabled: true,
      watching: true,
      folder: 'gamegeek-import/chef/',
      lastFile: { status: 'imported', processedAt: new Date().toISOString(), counts: { update: 2, movedToPlaying: 2, flaggedUninstalled: 1 } },
    });
    expect(line).toMatch(/\(2 updated, 2 moved to Playing, 1 not installed anymore\)$/);
  });

  it('no install summary when nothing moved or flagged', () => {
    renderWithProviders(<PlaynitePreview preview={{ total: 1, counts: { unchanged: 1 }, samples: {} }} />);
    expect(screen.queryByTestId('playnite-install-summary')).toBeNull();
  });
});
