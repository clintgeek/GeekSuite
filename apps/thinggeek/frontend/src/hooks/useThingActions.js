/**
 * Thing writes, each with the cache work it owes:
 *   create  → the list refreshes IN PLACE (never refetch — see cachePolicies)
 *   update  → the answer updates Thing:<id>; counts are dropped (a new tag or
 *             place moves every facet)
 *   trash   → the row leaves every cached list
 *   restore → the list refreshes in place, Trash re-reads
 */
import { useCallback } from 'react';
import { useApolloClient, useMutation } from '@apollo/client';
import { CREATE_THING, DELETE_THING, RESTORE_THING, UPDATE_THING } from '../graphql/mutations';
import { removeThingFromLists, resetCounts } from '../graphql/cachePolicies';
import { refreshLibraryList } from './useLibrary';

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
      return thing;
    },
    [client, createMutation]
  );

  const updateThing = useCallback(
    async (id, input) => {
      const res = await updateMutation({ variables: { id, input } });
      resetCounts(client);
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
      return true;
    },
    [client, deleteMutation]
  );

  const restoreThing = useCallback(
    async (id) => {
      const res = await restoreMutation({ variables: { id } });
      resetCounts(client);
      refreshLibraryList(client, '').catch(() => {});
      return res.data?.restoreThing;
    },
    [client, restoreMutation]
  );

  return { createThing, updateThing, trashThing, restoreThing };
}
