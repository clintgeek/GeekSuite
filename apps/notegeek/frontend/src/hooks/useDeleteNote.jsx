import React, { useCallback } from 'react';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import useNoteStore from '../store/noteStore';
import { restoreNoteApi } from '../services/api';

/**
 * Delete a note at once, with Undo in the toast — the same as Archive.
 *
 * Delete is a soft delete (contract C4): the note waits in Recently deleted
 * for 30 days with its history. Because it can be undone, it no longer asks
 * first (review 2026-11-18 #8, reversing decision D1's "Cancel focused"
 * confirm; suite rule: an action that can be undone acts at once and offers
 * Undo; only one that cannot asks). "Delete forever" in Recently deleted is
 * the one that still asks.
 *
 * `deleteNote(id, { onDeleted })`: `onDeleted` runs once the server has the
 * delete and before navigating home — the editor uses it to stand down its
 * unmount flush, which would otherwise fire `updateNote` at a deleted row.
 * Returns true when the note was deleted.
 */
export function useDeleteNote() {
  const navigate = useNavigate();
  const { notify, dismiss } = useToast();

  return useCallback(async (noteId, { onDeleted } = {}) => {
    if (!noteId) return false;
    let success = false;
    try {
      success = await useNoteStore.getState().deleteNote(noteId);
    } catch (err) {
      console.error('Error deleting note:', err);
    }
    if (!success) {
      notify(useNoteStore.getState().selectedError || 'Could not delete the note.', { tone: 'error' });
      return false;
    }
    onDeleted?.();
    navigate('/');
    // The toast outlives the page it was raised on, so Undo calls the API
    // directly rather than anything of the caller's.
    let toastId = null;
    toastId = notify('Note deleted', {
      tone: 'success',
      duration: 10000,
      action: (
        <Button
          color="inherit"
          size="small"
          onClick={async () => {
            if (toastId != null) dismiss?.(toastId);
            try {
              await restoreNoteApi(noteId);
              useNoteStore.getState().refreshLists?.();
              notify('Note restored', { tone: 'success' });
            } catch (err) {
              notify(err?.message || 'Could not restore it. It is in Recently deleted.', { tone: 'error' });
            }
          }}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44 }}
        >
          Undo
        </Button>
      ),
    });
    return true;
  }, [navigate, notify, dismiss]);
}

export default useDeleteNote;
