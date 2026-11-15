import React from 'react';
import { DialogContentText, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { GeekDialog, useToast } from '@geeksuite/ui';
import useNoteStore from '../store/noteStore';
import { restoreNoteApi } from '../services/api';

/**
 * `onDiscarded` — "this note is gone, stand down" — is fired on BOTH exit paths
 * and navigates nowhere; the dialog owns navigation.
 *
 * It exists because the editor flushes an unsaved draft on unmount. Without it,
 * discarding a new note saved the very draft being discarded, and deleting a
 * saved one fired an `updateNote` against a row that had just been deleted.
 *
 * It is deliberately NOT `onClose`. The two used to be one handler, so the
 * dialog's *Cancel* button navigated away from an unsaved note — cancelling
 * the confirm dialog was itself a way to leave the page.
 *
 * Delete is a soft delete (C4, decision D1, review 2026-11 1.19): the note
 * waits in Recently deleted for 30 days with its history, and the toast
 * offers Undo. **Cancel** is the focused button, so Enter never deletes.
 */
function DeleteNoteDialog({ open, onClose, onDiscarded, noteId, noteTitle, isUnsavedNote }) {
  const navigate = useNavigate();
  const deleteNote = useNoteStore(state => state.deleteNote);
  const { notify, dismiss } = useToast();

  const handleDelete = async () => {
    try {
      // An unsaved note has nothing to delete — stand the flush down and leave.
      if (isUnsavedNote) {
        if (onDiscarded) onDiscarded();
        onClose();
        navigate('/notes');
        return;
      }

      // For saved notes, attempt to delete from the database
      const success = await deleteNote(noteId);
      if (success) {
        if (onDiscarded) onDiscarded();
        onClose();
        navigate('/');
        // The toast outlives this dialog (and the page it was on), so Undo
        // calls the API directly rather than anything of this component's.
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
      } else {
        notify(useNoteStore.getState().selectedError || 'Could not delete the note.', { tone: 'error' });
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  return (
    // `mode="window"` — a two-line confirm doesn't need the full-screen
    // form treatment (MOBILE_UI_PLAN.md §4 notegeek: "full-screen rule is
    // for forms"); the centered card is the right shape at every width.
    <GeekDialog
      open={open}
      onClose={onClose}
      mode="window"
      title="Delete Note"
      primaryAction={
        <Button onClick={handleDelete} variant="contained" color="error">
          {isUnsavedNote ? 'Discard' : 'Delete'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} variant="text" color="inherit" autoFocus>
          Cancel
        </Button>
      }
    >
      <DialogContentText id="delete-note-dialog-description">
        {isUnsavedNote ? (
          "Are you sure you want to discard this unsaved note?"
        ) : (
          `Delete ${noteTitle || 'this note'}? It stays in Recently deleted for 30 days, where you can restore it.`
        )}
      </DialogContentText>
    </GeekDialog>
  );
}

export default DeleteNoteDialog;
