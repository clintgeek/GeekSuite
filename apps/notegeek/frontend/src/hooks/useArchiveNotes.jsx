import React, { useCallback, useRef } from 'react';
import { Button } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { ARCHIVE_NOTES, RESTORE_NOTES } from '../graphql/archive';
import { onNotesArchived } from '../graphql/cacheUpdates';
import useNoteStore from '../store/noteStore';

const plural = (n) => `${n} note${n === 1 ? '' : 's'}`;

/**
 * Archive and restore (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §3, U5–U8).
 *
 * One place owns the two mutations, their cache consequences and their
 * toasts, so the editor's ⋯ menu, the viewer, the selection bar, the archived
 * banner and Compose's archive offer all behave the same:
 *
 *   - `archive(ids)` → "Archived 4 notes" with **Undo** (→ `restore`).
 *   - `restore(ids)` → "Restored 4 notes".
 *
 * Apollo-backed lists follow from `onNotesArchived` (graphql/cacheUpdates.js).
 * Home and search read the zustand store, which is told separately: archived
 * rows are dropped from it at once, restored ones re-read.
 *
 * Each returns the ids that actually changed, or `null` when the call failed
 * (already said in an error toast), so a caller can keep its selection.
 */
export function useArchiveNotes() {
  const { notify, dismiss } = useToast();
  const [archiveMutation, { loading: archiving }] = useMutation(ARCHIVE_NOTES, { update: onNotesArchived(true) });
  const [restoreMutation, { loading: restoring }] = useMutation(RESTORE_NOTES, { update: onNotesArchived(false) });
  // The Undo button outlives the component that archived (the toast stays
  // up while Compose opens the new note), so it calls through a ref.
  const restoreRef = useRef(null);

  const restore = useCallback(async (ids, { quiet = false } = {}) => {
    if (!ids?.length) return [];
    try {
      const { data } = await restoreMutation({ variables: { ids } });
      const changed = data?.restoreNotes?.ids || [];
      useNoteStore.getState().refreshLists?.();
      if (!quiet) notify(`Restored ${plural(changed.length)}`, { tone: 'success' });
      return changed;
    } catch (err) {
      notify(err?.message || 'Could not restore. Try again from Archived.', { tone: 'error' });
      return null;
    }
  }, [restoreMutation, notify]);
  restoreRef.current = restore;

  const archive = useCallback(async (ids, { undo = true } = {}) => {
    if (!ids?.length) return [];
    try {
      const { data } = await archiveMutation({ variables: { ids } });
      const changed = data?.archiveNotes?.ids || [];
      useNoteStore.getState().dropNotes?.(changed);
      let toastId = null;
      toastId = notify(`Archived ${plural(changed.length)}`, {
        tone: 'success',
        duration: undo ? 10000 : undefined,
        action: undo && changed.length ? (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              if (toastId != null) dismiss?.(toastId);
              restoreRef.current?.(changed);
            }}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44 }}
          >
            Undo
          </Button>
        ) : undefined,
      });
      return changed;
    } catch (err) {
      notify(err?.message || 'Could not archive. Nothing changed.', { tone: 'error' });
      return null;
    }
  }, [archiveMutation, notify, dismiss]);

  return { archive, restore, archiving, restoring, busy: archiving || restoring };
}

export default useArchiveNotes;
