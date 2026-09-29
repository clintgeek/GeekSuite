import { useMutation } from '@apollo/client';
import { SET_NOTE_PINNED } from '../graphql/pinNote';
import { onNotePinned } from '../graphql/cacheUpdates';

/**
 * Pin or unpin a note.
 *
 * `setPinned(id, pinned)` fires the mutation and returns its promise. An
 * optimistic response flips the badge instantly; `onNotePinned` then evicts
 * cached `notes` lists so their order catches up to the server (pinned
 * notes sort first) on next read.
 *
 * This hook owns the network call and cache consequence ONLY — it renders
 * nothing. The pin control itself (button/badge in the row and editor
 * chrome) is built by whoever owns those components; wire this hook in
 * there rather than duplicating the mutation.
 */
export function usePinNote() {
  const [mutate, { loading, error }] = useMutation(SET_NOTE_PINNED, {
    update: onNotePinned,
  });

  const setPinned = (id, pinned) =>
    mutate({
      variables: { id, pinned },
      optimisticResponse: {
        setNotePinned: {
          __typename: 'Note',
          id,
          pinned,
          pinnedAt: pinned ? new Date().toISOString() : null,
        },
      },
    });

  return [setPinned, { loading, error }];
}

export default usePinNote;
