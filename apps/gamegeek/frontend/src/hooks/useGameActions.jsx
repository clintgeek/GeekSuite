/**
 * The state writes every surface shares — rating, shelf, and the rest of the
 * caller's own GameStateInput — with the toasts and Undo that go with them.
 */
import { useCallback, useMemo } from 'react';
import { Button } from '@mui/material';
import { useApolloClient, useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { RESOLVE_INSTALL_FLAG, SET_GAME_STATE } from '../graphql/mutations';
import { answeredMessage, createResolveInstallFlag } from '../utils/installDecision';
import { createRateGame } from '../utils/rateGame';
import { shelfLabel } from '../utils/vocab';

// Never 'GetGames': the list updates from the cache (see views/detail/useDetailActions.js).
const REFRESH_AGGREGATES = ['GetGameShelves', 'GetGameFacets'];

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
    (gameId, input, { refetchCounts = false } = {}) =>
      mutate({ variables: { gameId, input }, refetchQueries: refetchCounts ? REFRESH_AGGREGATES : [] }).then((r) => r.data?.setGameState),
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
        await setState(game.id, { shelf }, { refetchCounts: true });
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

/**
 * Answer "not installed anymore — how did it end?" optimistically, with an
 * Undo toast that puts the question back (resolveInstallFlag's `undo`).
 * Returns `(game, action) => Promise<boolean>`.
 */
export function useResolveInstallFlag() {
  const client = useApolloClient();
  const [resolveMutation] = useMutation(RESOLVE_INSTALL_FLAG);
  const { notify } = useToast();

  const resolveFlag = useMemo(
    () =>
      createResolveInstallFlag({
        save: (gameId, action) =>
          resolveMutation({ variables: { gameId, action }, refetchQueries: REFRESH_AGGREGATES }).then((r) => r.data?.resolveInstallFlag),
        apply: (id, patch) => writeMyField(client.cache, id, patch),
      }),
    [client, resolveMutation]
  );

  const resolve = useCallback(
    async (game, action, { quiet = false } = {}) => {
      const { ok } = await resolveFlag(game, action);
      if (!ok) {
        notify(action === 'undo' ? `Couldn't undo that for ${game.title}.` : `Couldn't save that for ${game.title}.`, { tone: 'error' });
        return false;
      }
      if (!quiet) {
        const undoTarget = { ...game, me: { ...(game.me || {}), installFlag: null } };
        notify(answeredMessage(game.title, action), {
          tone: 'success',
          action: <UndoButton onClick={() => resolve(undoTarget, 'undo', { quiet: true })} />,
        });
      }
      return true;
    },
    [resolveFlag, notify]
  );

  return resolve;
}
