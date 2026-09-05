import { useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_COLLECTIONS } from '../graphql/queries';
import {
  CREATE_COLLECTION,
  UPDATE_COLLECTION,
  DELETE_COLLECTION,
} from '../graphql/mutations';
import { onCollectionCreated, onCollectionDeleted } from '../graphql/cacheUpdates';

/**
 * useCollections — the user's collections plus their CRUD operations.
 *
 * A small dedicated hook rather than another branch of TaskContext: collections
 * are their own resource with their own cache, and only two pages plus the task
 * editor need them.
 *
 * The gateway already returns them unarchived-first then alphabetical; the
 * `active` / `archived` splits below are just conveniences over that order.
 *
 * Cache handling follows the rule written down in `apolloClient.js`. These
 * three used to `await refetch()` after every write, which meant a network
 * round trip — and a visible pause — for a change the client already had in
 * its hand. Now:
 *   - create and delete change list membership, so they `cache.modify` the
 *     `collections` field (clause 2);
 *   - update changes only fields, and the mutation selects all of them, so it
 *     needs nothing at all (clause 1).
 * `refetch` is still returned for a caller that genuinely wants fresh server
 * state (a pull-to-refresh, say) — it is just no longer the default.
 */
const useCollections = ({ skip = false } = {}) => {
  const { data, loading, error, refetch } = useQuery(GET_COLLECTIONS, {
    fetchPolicy: 'cache-and-network',
    skip,
  });

  const [createMutation] = useMutation(CREATE_COLLECTION);
  const [updateMutation] = useMutation(UPDATE_COLLECTION);
  const [deleteMutation] = useMutation(DELETE_COLLECTION);

  const collections = useMemo(() => data?.collections ?? [], [data]);
  const active = useMemo(() => collections.filter((c) => !c.archived), [collections]);
  const archived = useMemo(() => collections.filter((c) => c.archived), [collections]);

  const createCollection = useCallback(async (name, description) => {
    const res = await createMutation({
      variables: { name, description: description || null },
      update: onCollectionCreated,
    });
    return res.data?.createCollection;
  }, [createMutation]);

  // Clause 1: `UpdateCollection` selects every field the list and the detail
  // header render (name, description, archived, both counts), so the
  // normalised cache merges the result into `Collection:<id>` and both views
  // redraw without anyone asking them to.
  const updateCollection = useCallback(async (id, updates) => {
    const res = await updateMutation({ variables: { id, ...updates } });
    return res.data?.updateCollection;
  }, [updateMutation]);

  const deleteCollection = useCallback(async (id, deleteTasks = false) => {
    const res = await deleteMutation({
      variables: { id, deleteTasks },
      update: onCollectionDeleted(id, deleteTasks),
    });
    return res.data?.deleteCollection;
  }, [deleteMutation]);

  return {
    collections,
    active,
    archived,
    loading,
    error,
    refetch,
    createCollection,
    updateCollection,
    deleteCollection,
  };
};

export default useCollections;
