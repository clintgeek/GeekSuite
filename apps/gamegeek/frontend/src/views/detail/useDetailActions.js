/**
 * Every write the detail sheet makes, in one place, with the refetches each
 * one needs. Game-returning mutations update `Game:<id>` through the cache;
 * the lists only refetch when a write can move a game between them.
 */
import { useCallback } from 'react';
import { useApolloClient, useMutation } from '@apollo/client';
import {
  DELETE_GAME,
  DELETE_GAME_PLAYTHROUGH,
  DELETE_GAME_SESSION,
  LOG_GAME_SESSION,
  SAVE_GAME_PLAYTHROUGH,
  UPDATE_GAME,
} from '../../graphql/mutations';
import {
  applyMetadataCandidate,
  deleteCover,
  fetchCover,
  refreshGameMetadata,
  unlinkMetadata,
  uploadCover,
} from '../../api/rest';

const LISTS = ['GetGames', 'GetGameShelves'];

export function useDetailActions(gameId) {
  const client = useApolloClient();
  const [logSession] = useMutation(LOG_GAME_SESSION);
  const [deleteSession] = useMutation(DELETE_GAME_SESSION);
  const [savePlaythrough] = useMutation(SAVE_GAME_PLAYTHROUGH);
  const [deletePlaythrough] = useMutation(DELETE_GAME_PLAYTHROUGH);
  const [updateGame] = useMutation(UPDATE_GAME);
  const [deleteGame] = useMutation(DELETE_GAME);

  const refetchGame = useCallback(
    () => client.refetchQueries({ include: ['GetGame', ...LISTS] }),
    [client]
  );

  return {
    // Logging can move a backlog game to Playing, so the lists refetch.
    logSession: (input) => logSession({ variables: { gameId, input }, refetchQueries: LISTS }),
    deleteSession: (sessionId) => deleteSession({ variables: { gameId, sessionId }, refetchQueries: LISTS }),
    savePlaythrough: (input) => savePlaythrough({ variables: { gameId, input } }),
    deletePlaythrough: (playthroughId) => deletePlaythrough({ variables: { gameId, playthroughId } }),
    updateGame: (input) => updateGame({ variables: { id: gameId, input }, refetchQueries: LISTS }),
    deleteGame: async () => {
      const res = await deleteGame({ variables: { id: gameId } });
      if (!res.data?.deleteGame?.success) throw new Error(res.data?.deleteGame?.message || 'Delete failed');
      client.cache.evict({ id: client.cache.identify({ __typename: 'Game', id: gameId }) });
      client.cache.gc();
      await client.refetchQueries({ include: LISTS });
      return true;
    },
    // Covers are bytes on the gamegeek backend; the gateway's coverUrl
    // changes with updatedAt, so a refetch picks the new art up everywhere.
    fetchCover: async (url) => {
      await fetchCover(gameId, url);
      await refetchGame();
    },
    uploadCover: async (file) => {
      await uploadCover(gameId, file);
      await refetchGame();
    },
    removeCover: async () => {
      await deleteCover(gameId);
      await refetchGame();
    },
    // Metadata enrichment (DOCS/METADATA_ENRICHMENT.md): all three write on
    // the gamegeek REST backend, not the gateway, and the game's fields
    // (cover included) only settle in the cache once it refetches.
    refreshMetadata: async () => {
      await refreshGameMetadata(gameId);
      await refetchGame();
    },
    applyMetadataCandidate: async (candidate) => {
      await applyMetadataCandidate(gameId, { provider: candidate.provider, providerId: candidate.providerId });
      await refetchGame();
    },
    unlinkMetadata: async () => {
      await unlinkMetadata(gameId);
      await refetchGame();
    },
  };
}
