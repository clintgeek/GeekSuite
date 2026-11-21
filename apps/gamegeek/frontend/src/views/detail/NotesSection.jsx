/** My notes (private working notes) and my review (the verdict). Saved on demand. */
import React, { useRef, useState } from 'react';
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
const FIELDS = ['notes', 'review'];

/** The draft's own edits only: a field typed back to what is saved is no edit. */
function changedFields(draft, saved) {
  const out = {};
  for (const field of FIELDS) {
    if (draft?.[field] !== undefined && draft[field] !== saved[field]) out[field] = draft[field];
  }
  return Object.keys(out).length ? out : null;
}

export default function NotesSection({ game, draft: heldDraft, onDraft }) {
  const setState = useSetGameState();
  const { notify } = useToast();
  const [ownDraft, setOwnDraft] = useState(null);
  const lifted = typeof onDraft === 'function';
  const draft = lifted ? heldDraft : ownDraft;
  const setDraft = lifted ? onDraft : setOwnDraft;
  const [busy, setBusy] = useState(false);

  const saved = { notes: game.me?.notes || '', review: game.me?.review || '' };
  // The draft holds only the fields she changed; the rest read from the game,
  // so a review saved elsewhere is not written back stale with her notes.
  const edits = changedFields(draft, saved);
  const notes = edits?.notes ?? saved.notes;
  const review = edits?.review ?? saved.review;
  const edit = (patch) => setDraft(changedFields({ ...edits, ...patch }, saved));
  // What she has typed by the time a save comes back (she can keep typing).
  const latest = useRef(edits);
  latest.current = edits;

  const dirty = Boolean(edits);

  const save = async () => {
    if (!edits) return;
    const sent = edits;
    setBusy(true);
    try {
      await setState(game.id, sent);
      // Cleared only if nothing was typed while it saved; later typing stays.
      const now = latest.current;
      if (FIELDS.every((field) => now?.[field] === sent[field])) setDraft(null);
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
