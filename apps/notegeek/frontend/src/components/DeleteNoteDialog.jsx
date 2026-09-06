import React from 'react';
import { DialogContentText, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { GeekDialog } from '@geeksuite/ui';
import useNoteStore from '../store/noteStore';

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
 */
function DeleteNoteDialog({ open, onClose, onDiscarded, noteId, noteTitle, isUnsavedNote }) {
  const navigate = useNavigate();
  const deleteNote = useNoteStore(state => state.deleteNote);

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
        <Button onClick={handleDelete} variant="contained" color="error" autoFocus>
          {isUnsavedNote ? 'Discard' : 'Delete'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} variant="text" color="inherit">
          Cancel
        </Button>
      }
    >
      <DialogContentText id="delete-note-dialog-description">
        {isUnsavedNote ? (
          "Are you sure you want to discard this unsaved note?"
        ) : (
          `Are you sure you want to delete ${noteTitle || 'this note'}? This action cannot be undone.`
        )}
      </DialogContentText>
    </GeekDialog>
  );
}

export default DeleteNoteDialog;
