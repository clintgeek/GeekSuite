import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="delete-note-dialog-title"
      aria-describedby="delete-note-dialog-description"
    >
      <DialogTitle id="delete-note-dialog-title">
        Delete Note
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="delete-note-dialog-description">
          {isUnsavedNote ? (
            "Are you sure you want to discard this unsaved note?"
          ) : (
            `Are you sure you want to delete ${noteTitle || 'this note'}? This action cannot be undone.`
          )}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} variant="text" color="inherit">
          Cancel
        </Button>
        <Button onClick={handleDelete} variant="contained" color="error" autoFocus>
          {isUnsavedNote ? 'Discard' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeleteNoteDialog;