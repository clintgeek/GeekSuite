import React, { useState, useEffect } from 'react';
import {
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Alert,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NoteIcon from '@mui/icons-material/Note';
import { api } from '../lib/api.js';
import { useNotifications } from './Notifications.jsx';

export default function BirdNotes({ birdId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [form, setForm] = useState({
    loggedAt: new Date().toISOString().split('T')[0],
    note: ''
  });
  const { showSuccess, showError } = useNotifications();

  const loadNotes = async () => {
    try {
      setLoading(true);
      const notesData = await api.listBirdNotes({ birdId, limit: 100 });
      setNotes(notesData);
    } catch (error) {
      showError('Failed to load notes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (birdId) {
      loadNotes();
    }
  }, [birdId]);

  const resetForm = () => {
    setForm({
      loggedAt: new Date().toISOString().split('T')[0],
      note: ''
    });
    setEditingNote(null);
  };

  const openDialog = (note = null) => {
    if (note) {
      setEditingNote(note);
      setForm({
        loggedAt: new Date(note.loggedAt).toISOString().split('T')[0],
        note: note.note || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!form.note.trim()) {
      showError('Note text is required');
      return;
    }

    try {
      const payload = {
        birdId,
        loggedAt: form.loggedAt,
        note: form.note.trim()
      };

      if (editingNote) {
        await api.updateBirdNote(editingNote._id, payload);
        showSuccess('Note updated successfully');
      } else {
        await api.createBirdNote(payload);
        showSuccess('Note added successfully');
      }

      closeDialog();
      loadNotes();
    } catch (error) {
      showError('Failed to save note: ' + error.message);
    }
  };

  const handleDelete = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.deleteBirdNote(noteId);
      showSuccess('Note deleted successfully');
      loadNotes();
    } catch (error) {
      showError('Failed to delete note: ' + error.message);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <Typography>Loading notes...</Typography>;
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Notes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openDialog()}
          size="small"
        >
          Add Note
        </Button>
      </Box>

      {notes.length === 0 ? (
        <Alert severity="info">No notes yet. Add the first one!</Alert>
      ) : (
        <Card>
          <CardContent>
            <List>
              {notes.map((note, index) => (
                <React.Fragment key={note._id}>
                  {index > 0 && <Divider />}
                  <ListItem
                    alignItems="flex-start"
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => openDialog(note)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDelete(note._id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    }
                    sx={{ py: 2 }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <NoteIcon fontSize="small" color="primary" />
                          <Typography variant="body2" fontWeight="bold" color="text.secondary">
                            {formatDate(note.loggedAt)}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        <Typography
                          variant="body1"
                          sx={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            mt: 0.5
                          }}
                        >
                          {note.note}
                        </Typography>
                      }
                    />
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingNote ? 'Edit Note' : 'Add Note'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={form.loggedAt}
              onChange={(e) => setForm({ ...form, loggedAt: e.target.value })}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              fullWidth
              required
              multiline
              rows={6}
              placeholder="Enter your note here..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingNote ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}