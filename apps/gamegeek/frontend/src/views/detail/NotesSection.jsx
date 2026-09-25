/** My notes (private working notes) and my review (the verdict). Saved on demand. */
import React, { useEffect, useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { useSetGameState } from '../../hooks/useGameActions';
import Section from './Section';

export default function NotesSection({ game }) {
  const setState = useSetGameState();
  const { notify } = useToast();
  const [notes, setNotes] = useState(game.me?.notes || '');
  const [review, setReview] = useState(game.me?.review || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => setNotes(game.me?.notes || ''), [game.me?.notes]);
  useEffect(() => setReview(game.me?.review || ''), [game.me?.review]);

  const dirty = notes !== (game.me?.notes || '') || review !== (game.me?.review || '');

  const save = async () => {
    setBusy(true);
    try {
      await setState(game.id, { notes, review });
      notify('Saved.', { tone: 'success' });
    } catch {
      notify('Notes did not save.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Notes & review"
      id="notes"
      action={
        dirty ? (
          <Button variant="contained" onClick={save} disabled={busy} sx={{ minHeight: 36 }}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        ) : null
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label="Notes"
          placeholder="Where you left off, codes, which save slot…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          inputProps={{ maxLength: 5000 }}
        />
        <TextField
          label="Review"
          placeholder="One line or a page — what did you make of it?"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          inputProps={{ maxLength: 5000 }}
        />
      </Box>
    </Section>
  );
}
