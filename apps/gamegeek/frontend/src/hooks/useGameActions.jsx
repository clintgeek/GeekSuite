/**
 * The state writes every surface shares — rating, shelf, and the rest of the
 * caller's own GameStateInput — with the toasts and Undo that go with them.
 */
import { useCallback, useMemo } from 'react';
import { Button } from '@mui/material';
import { useApolloClient, useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { SET_GAME_STATE } from '../graphql/mutations';
import { createRateGame } from '../utils/rateGame';
import { shelfLabel } from '../utils/vocab';

const REFRESH_LISTS = ['GetGames', 'GetGameShelves'];

function writeMyField(cache, id, patch) {
  cache.modify({
    id: cache.identify({ __typename: 'Game', id }),
    fields: {
      me(existing) {
        if (!existing) return existing;
        return { ...existing, ...patch };
      },
    },
  });
}

function UndoButton({ onClick }) {
  return (
    <Button color="inherit" onClick={onClick} sx={{ fontWeight: 700, minHeight: 36 }}>
      Undo
    </Button>
  );
}

export function useSetGameState() {
  const [mutate] = useMutation(SET_GAME_STATE);
  return useCallback(
    (gameId, input, { refetchLists = false } = {}) =>
      mutate({ variables: { gameId, input }, refetchQueries: refetchLists ? REFRESH_LISTS : [] }).then((r) => r.data?.setGameState),
    [mutate]
  );
}

/** Optimistic rating with an Undo toast. Returns `(game, rating|null) => Promise`. */
export function useRateGame() {
  const client = useApolloClient();
  const setState = useSetGameState();
  const { notify } = useToast();

  const rateGame = useMemo(
    () =>
      createRateGame({
        save: (id, rating) => setState(id, { rating }),
        apply: (id, rating) => writeMyField(client.cache, id, { rating }),
      }),
    [client, setState]
  );

  const rate = useCallback(
    async (game, rating, { quiet = false } = {}) => {
      const { ok, previous } = await rateGame(game, rating);
      if (!ok) {
        notify(`Couldn't save the rating for ${game.title}.`, { tone: 'error' });
        return false;
      }
      if (!quiet) {
        const undoTarget = { ...game, me: { ...(game.me || {}), rating } };
        notify(rating ? `Rated ${game.title} ${'★'.repeat(Math.round(rating))}` : `Cleared the rating for ${game.title}`, {
          tone: 'success',
          action: <UndoButton onClick={() => rate(undoTarget, previous, { quiet: true })} />,
        });
      }
      return true;
    },
    [rateGame, notify]
  );

  return rate;
}

/** Move a game to a shelf (or null to unshelve), with Undo. */
export function useSetShelf(customShelves = []) {
  const setState = useSetGameState();
  const { notify } = useToast();

  const setShelf = useCallback(
    async (game, shelf, { quiet = false } = {}) => {
      const previous = game.me?.shelf ?? null;
      if (previous === shelf) return true;
      try {
        await setState(game.id, { shelf }, { refetchLists: true });
      } catch {
        notify(`Couldn't move ${game.title}.`, { tone: 'error' });
        return false;
      }
      if (!quiet) {
        const undoTarget = { ...game, me: { ...(game.me || {}), shelf } };
        notify(shelf ? `${game.title} → ${shelfLabel(shelf, customShelves)}` : `${game.title} is off every shelf`, {
          tone: 'success',
          action: <UndoButton onClick={() => setShelf(undoTarget, previous, { quiet: true })} />,
        });
      }
      return true;
    },
    [setState, notify, customShelves]
  );

  return setShelf;
}
