import { gql } from '@apollo/client';

/**
 * Pin or unpin a note. Scoped to the owner on the gateway (like every other
 * note mutation) — see `apps/basegeek/packages/api/src/graphql/notegeek/`.
 * `notes` sorts pinned notes first server-side; this mutation only flips the
 * flag, so `onNotePinned` in `cacheUpdates.js` evicts cached `notes` lists to
 * pick up the new order.
 */
export const SET_NOTE_PINNED = gql`
    mutation SetNotePinned($id: ID!, $pinned: Boolean!) {
        setNotePinned(id: $id, pinned: $pinned) {
            id
            pinned
            pinnedAt
        }
    }
`;
