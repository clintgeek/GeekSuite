/**
 * The detail sheet (/game/:id) as a whole — SUITE_REVIEW_2026-11 GameGeek:
 *   - S-D2: no hours and no sessions anywhere on it, and no Log session action;
 *   - finding 4's landmine: the sheet IS a route, so it must not take its own
 *     Back entry (backToClose={false}). With one, Back ran `close` — a push to
 *     the library — and every later Back landed on /game/:id again.
 *   - S-D1: the delete dialog says it is for everyone, that Playnite won't
 *     bring it back, and that Settings can restore it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { InMemoryCache } from '@apollo/client';
import { Route, Routes } from 'react-router-dom';
import GameDetail from '../../views/detail/GameDetail';
import { GET_GAME } from '../../graphql/queries';
import { GAME_TYPE_POLICIES } from '../../graphql/cachePolicies';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/rest', () => ({
  getGameMedia: vi.fn(() => new Promise(() => {})),
  applyMetadataCandidate: vi.fn(),
  deleteCover: vi.fn(),
  fetchCover: vi.fn(),
  refreshGameMetadata: vi.fn(),
  unlinkMetadata: vi.fn(),
  uploadCover: vi.fn(),
}));

const game = makeDetailGame({
  household: [{ __typename: 'GameHouseholdEntry', userId: 'u2', displayName: 'Heather', shelf: 'finished', rating: 5 }],
  me: {
    ...makeDetailGame().me,
    playthroughs: [
      { __typename: 'GamePlaythrough', id: 'p1', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: null, platform: 'switch', difficulty: null, completion: null, notes: '' },
    ],
  },
});

function renderDetail() {
  const mocks = [{ request: { query: GET_GAME, variables: { id: 'g1' } }, result: { data: { game } }, maxUsageCount: 5 }];
  return renderWithProviders(
    <Routes>
      <Route path="/game/:id" element={<GameDetail />} />
    </Routes>,
    {
      initialEntries: ['/game/g1'],
      wrapper: ({ children }) => (
        <MockedProvider mocks={mocks} cache={new InMemoryCache({ typePolicies: GAME_TYPE_POLICIES })}>
          {children}
        </MockedProvider>
      ),
    }
  );
}

// The whole sheet mounts here (MUI, Apollo, every section): give it room on a
// loaded machine rather than the 1 s findBy default.
const SLOW = { timeout: 15000 };

describe('GameDetail', { timeout: 60000 }, () => {
  afterEach(() => vi.clearAllMocks());

  it('has no Log session action, no sessions section and no hours anywhere (S-D2)', async () => {
    renderDetail();
    const bar = await screen.findByTestId('detail-actions', {}, SLOW);
    expect(within(bar).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /log session/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /sessions/i })).toBeNull();
    expect(screen.getByText('Heather')).toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toMatch(/\bhours?\b/i);
    expect(text).not.toMatch(/\d+(\.\d+)? h\b/);
  });

  it('takes no Back entry of its own: it is a route, so Back already closes it', async () => {
    renderDetail();
    await screen.findByTestId('detail-actions', {}, SLOW);
    expect(window.history.state?.__geekBack ?? []).toEqual([]);
  });

  it('the delete dialog says who loses it, that Playnite will not bring it back, and where to restore it', async () => {
    renderDetail();
    await screen.findByTestId('detail-actions', {}, SLOW);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }, SLOW));
    const dialog = await screen.findByRole('dialog', { name: /delete this game/i }, SLOW);
    expect(dialog).toHaveTextContent(/for everyone in the household/i);
    expect(dialog).toHaveTextContent(/Playnite won.t bring it back/i);
    expect(dialog).toHaveTextContent(/Settings → Deleted games/);
  });
});
