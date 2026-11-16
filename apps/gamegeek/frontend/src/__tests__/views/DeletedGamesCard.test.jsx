/**
 * Settings → Deleted games (SUITE_REVIEW_2026-11 S-D1): the list, what Restore
 * will do for each kind of entry, Restore itself, and a failed read that is
 * not shown as "nothing deleted".
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import DeletedGamesCard, { restoreHint } from '../../views/settings/DeletedGamesCard';
import { GET_DELETED_GAMES } from '../../graphql/queries';
import { RESTORE_DELETED_GAME } from '../../graphql/mutations';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const entry = (over = {}) => ({
  __typename: 'GameDeletedEntry',
  id: 'd1',
  title: 'Hades',
  deletedAt: new Date().toISOString(),
  deletedBy: 'u2',
  deletedByName: 'Heather',
  hasSnapshot: true,
  reason: 'game-deleted',
  playniteCopies: 1,
  members: 2,
  ...over,
});

const OLD = entry({ id: 't1', title: 'Old Game', hasSnapshot: false, reason: null, members: 0, deletedByName: null, deletedAt: '2026-10-01T12:00:00.000Z' });

const listMock = (deletedGames) => ({ request: { query: GET_DELETED_GAMES }, result: { data: { deletedGames } } });

function renderCard(mocks) {
  return renderWithProviders(<DeletedGamesCard />, {
    wrapper: ({ children }) => <MockedProvider mocks={mocks}>{children}</MockedProvider>,
  });
}

describe('restoreHint', () => {
  it('says what Restore does for each kind of entry', () => {
    expect(restoreHint(entry())).toMatch(/everyone’s shelf, rating and notes \(2 people\)/);
    expect(restoreHint(entry({ members: 1 }))).toMatch(/the shelf, rating and notes \(1 person\)/);
    expect(restoreHint(OLD)).toMatch(/Deleted before restore existed.*next Playnite import add it back, without shelves or ratings/);
    expect(restoreHint(entry({ hasSnapshot: false, reason: 'copy-removed' }))).toMatch(/copy removed by hand.*next Playnite import/);
  });
});

describe('DeletedGamesCard', () => {
  it('lists deleted games with who deleted them and what Restore will do', async () => {
    renderCard([listMock([entry(), OLD])]);
    const list = await screen.findByTestId('deleted-games-list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Hades');
    expect(rows[0]).toHaveTextContent('Deleted today by Heather');
    expect(rows[1]).toHaveTextContent('Old Game');
    expect(rows[1]).toHaveTextContent(/Deleted on /);
    expect(rows[1]).toHaveTextContent(/Deleted before restore existed/);
    expect(within(rows[0]).getByRole('button', { name: 'Restore Hades' })).toBeEnabled();
  });

  it('Restore calls the mutation, says the game is back, and the list refetches', async () => {
    const restored = makeDetailGame();
    renderCard([
      listMock([entry()]),
      {
        request: { query: RESTORE_DELETED_GAME, variables: { id: 'd1' } },
        result: { data: { restoreDeletedGame: { __typename: 'GameRestoreResult', success: true, message: 'Hades is back.', waitsForImport: false, game: restored } } },
      },
      listMock([]),
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Hades' }));
    expect(await screen.findByText('Hades is back in the library.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('deleted-games-empty')).toBeInTheDocument());
  });

  it('an entry with no snapshot says it comes back with the next import', async () => {
    renderCard([
      listMock([OLD]),
      {
        request: { query: RESTORE_DELETED_GAME, variables: { id: 't1' } },
        result: { data: { restoreDeletedGame: { __typename: 'GameRestoreResult', success: true, message: 'x', waitsForImport: true, game: null } } },
      },
      listMock([]),
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Old Game' }));
    expect(await screen.findByText('Old Game comes back with the next Playnite import.')).toBeInTheDocument();
  });

  it('a refused restore says why and keeps the row', async () => {
    renderCard([
      listMock([entry()]),
      { request: { query: RESTORE_DELETED_GAME, variables: { id: 'd1' } }, result: { errors: [{ message: 'Hades (again) already holds this Playnite copy — delete that one first, then restore.' }] } },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Hades' }));
    expect(await screen.findByText(/already holds this Playnite copy/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Hades' })).toBeEnabled();
  });

  it('an empty list says nothing is deleted', async () => {
    renderCard([listMock([])]);
    expect(await screen.findByTestId('deleted-games-empty')).toHaveTextContent('Nothing deleted');
  });

  it('a failed read offers Try again, never "Nothing deleted"', async () => {
    renderCard([{ request: { query: GET_DELETED_GAMES }, error: new Error('network down') }]);
    expect(await screen.findByText(/didn.t load/)).toBeInTheDocument();
    expect(screen.queryByTestId('deleted-games-empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
