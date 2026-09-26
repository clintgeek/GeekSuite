/**
 * Thing writes, each with the cache work it owes:
 *   create  → the list refreshes IN PLACE (never refetch — see cachePolicies)
 *   update  → the answer updates Thing:<id>; counts are dropped (a new tag or
 *             parent moves every facet)
 *   move    → an update of parentId; what is inside moved too, so every
 *             loaded card's path is refreshed in place
 *   trash   → the row leaves every cached list
 *   restore → the list refreshes in place, Trash re-reads
 * Every one of them re-reads the containment tree and any open thing page
 * (its Contains and breadcrumb), by operation name — only if on screen.
 */
import { useCallback } from 'react';
import { useApolloClient, useMutation } from '@apollo/client';
import { CREATE_THING, DELETE_THING, RESTORE_THING, UPDATE_THING } from '../graphql/mutations';
import { removeThingFromLists, resetCounts } from '../graphql/cachePolicies';
import { refreshLibraryList } from './useLibrary';

/** The tree and any thing page on screen (Contains, the breadcrumb). Never the paged list. */
export function refreshContainment(client) {
  return client.refetchQueries({ include: ['GetThingTree', 'GetThing'] }).catch(() => {});
}

export function useThingActions() {
  const client = useApolloClient();
  const [createMutation] = useMutation(CREATE_THING);
  const [updateMutation] = useMutation(UPDATE_THING);
  const [deleteMutation] = useMutation(DELETE_THING);
  const [restoreMutation] = useMutation(RESTORE_THING);

  const createThing = useCallback(
    async (input, { search = '' } = {}) => {
      const res = await createMutation({ variables: { input } });
      const thing = res.data?.createThing;
      resetCounts(client);
      refreshLibraryList(client, search).catch(() => {});
      if (input?.parentId) refreshContainment(client);
      else client.refetchQueries({ include: ['GetThingTree'] }).catch(() => {});
      return thing;
    },
    [client, createMutation]
  );

  const updateThing = useCallback(
    async (id, input) => {
      const res = await updateMutation({ variables: { id, input } });
      resetCounts(client);
      if (input && ('parentId' in input || 'name' in input || 'typeId' in input)) refreshContainment(client);
      return res.data?.updateThing;
    },
    [client, updateMutation]
  );

  /** Move to `parentId` (null = the top level). Everything inside moves along. */
  const moveThing = useCallback(
    async (id, parentId, { search = '' } = {}) => {
      const res = await updateMutation({ variables: { id, input: { parentId: parentId ?? null } } });
      resetCounts(client);
      await refreshContainment(client);
      refreshLibraryList(client, search).catch(() => {});
      return res.data?.updateThing;
    },
    [client, updateMutation]
  );

  const trashThing = useCallback(
    async (id) => {
      const res = await deleteMutation({ variables: { id } });
      if (res.data?.deleteThing?.success === false) throw new Error(res.data.deleteThing.message || "Couldn't move it to the Trash.");
      removeThingFromLists(client.cache, id);
      resetCounts(client);
      refreshContainment(client);
      return true;
    },
    [client, deleteMutation]
  );

  const restoreThing = useCallback(
    async (id) => {
      const res = await restoreMutation({ variables: { id } });
      resetCounts(client);
      refreshLibraryList(client, '').catch(() => {});
      refreshContainment(client);
      return res.data?.restoreThing;
    },
    [client, restoreMutation]
  );

  return { createThing, updateThing, moveThing, trashThing, restoreThing };
}
