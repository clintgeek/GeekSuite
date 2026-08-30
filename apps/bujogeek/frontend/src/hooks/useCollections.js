import { useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_COLLECTIONS } from '../graphql/queries';
import {
  CREATE_COLLECTION,
  UPDATE_COLLECTION,
  DELETE_COLLECTION,
} from '../graphql/mutations';

/**
 * useCollections — the user's collections plus their CRUD operations.
 *
 * A small dedicated hook rather than another branch of TaskContext: collections
 * are their own resource with their own cache, and only two pages plus the task
 * editor need them.
 *
 * The gateway already returns them unarchived-first then alphabetical; the
 * `active` / `archived` splits below are just conveniences over that order.
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
    });
    await refetch();
    return res.data?.createCollection;
  }, [createMutation, refetch]);

  const updateCollection = useCallback(async (id, updates) => {
    const res = await updateMutation({ variables: { id, ...updates } });
    await refetch();
    return res.data?.updateCollection;
  }, [updateMutation, refetch]);

  const deleteCollection = useCallback(async (id, deleteTasks = false) => {
    const res = await deleteMutation({ variables: { id, deleteTasks } });
    await refetch();
    return res.data?.deleteCollection;
  }, [deleteMutation, refetch]);

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
