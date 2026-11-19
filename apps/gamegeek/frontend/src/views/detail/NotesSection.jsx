/** My notes (private working notes) and my review (the verdict). Saved on demand. */
import React, { useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { useSetGameState } from '../../hooks/useGameActions';
import Section from './Section';

/**
 * The typing lives with the caller (`draft` / `onDraft`, GameDetail), above
 * the GeekSheet: the sheet swaps between its phone sheet and desktop dialog
 * at md, which re-mounts everything inside it, and a tablet rotating across
 * that line used to throw a half-typed note away. Without a caller-held
 * draft it keeps its own.
 */
export default function NotesSection({ game, draft: heldDraft, onDraft }) {
  const setState = useSetGameState();
  const { notify } = useToast();
  const [ownDraft, setOwnDraft] = useState(null);
  const lifted = typeof onDraft === 'function';
  const draft = lifted ? heldDraft : ownDraft;
  const setDraft = lifted ? onDraft : setOwnDraft;
  const [busy, setBusy] = useState(false);

  const savedNotes = game.me?.notes || '';
  const savedReview = game.me?.review || '';
  const notes = draft?.notes ?? savedNotes;
  const review = draft?.review ?? savedReview;
  const edit = (patch) => setDraft({ notes, review, ...patch });

  const dirty = notes !== savedNotes || review !== savedReview;

  const save = async () => {
    setBusy(true);
    try {
      await setState(game.id, { notes, review });
      setDraft(null);
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
          onChange={(e) => edit({ notes: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          inputProps={{ maxLength: 5000 }}
        />
        <TextField
          label="Review"
          placeholder="One line or a page — what did you make of it?"
          value={review}
          onChange={(e) => edit({ review: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          inputProps={{ maxLength: 5000 }}
        />
      </Box>
    </Section>
  );
}
