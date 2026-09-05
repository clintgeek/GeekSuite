import React from 'react';
import { DialogContentText, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { GeekDialog } from '@geeksuite/ui';
import useNoteStore from '../store/noteStore';

function DeleteNoteDialog({ open, onClose, noteId, noteTitle, isUnsavedNote }) {
  const navigate = useNavigate();
  const deleteNote = useNoteStore(state => state.deleteNote);

  const handleDelete = async () => {
    try {
      // For unsaved notes, just close the dialog and let the onClose handler navigate
      if (isUnsavedNote) {
        onClose();
        return;
      }

      // For saved notes, attempt to delete from the database
      const success = await deleteNote(noteId);
      if (success) {
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
