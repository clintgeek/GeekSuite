import React from 'react';
import { Box, Button, DialogContentText, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';
import { formatRelativeTime } from '../../utils/dateUtils';

/**
 * "This note changed on another device" (review 2026-11, 1.4; contract C3).
 *
 * The gateway refused a save because the note's `updatedAt` is no longer the
 * one this editor started from: another tab or device wrote it in between.
 * Nothing is lost whichever button is pressed:
 *
 *   - Keep mine   — this screen's text replaces theirs (theirs stays in History).
 *   - Use theirs  — the other device's copy replaces what is on screen.
 *   - Keep both   — this screen's text becomes a NEW note; this one shows theirs.
 *
 * No button is autofocused and the backdrop does not close it: Enter must not
 * pick a side for the writer.
 */
export default function ConflictDialog({ open, serverNote, busy = false, onKeepMine, onUseTheirs, onKeepBoth }) {
  const when = serverNote?.updatedAt ? formatRelativeTime(serverNote.updatedAt) : null;
  // nowrap: on a phone "Keep mine" broke onto two lines beside the other two.
  const button = { textTransform: 'none', minHeight: 44, whiteSpace: 'nowrap', flexShrink: 0 };
  return (
    <GeekDialog
      open={open}
      // Deliberately not dismissable: closing it would leave the note unsaved
      // with autosave paused and no way back to these choices.
      onClose={() => {}}
      disableClose
      mode="window"
      title="This note changed on another device"
      primaryAction={
        <Button onClick={onKeepMine} disabled={busy} variant="contained" sx={button}>
          Keep mine
        </Button>
      }
      secondaryAction={
        <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button onClick={onKeepBoth} disabled={busy} variant="text" color="inherit" sx={button}>
            Keep both
          </Button>
          <Button onClick={onUseTheirs} disabled={busy} variant="text" color="inherit" sx={button}>
            Use theirs
          </Button>
        </Box>
      }
    >
      <DialogContentText component="div">
        <Typography variant="body2" sx={{ mb: '8px' }}>
          It was saved somewhere else{when ? ` ${when}` : ''} while you were editing it here.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Keep mine</strong> saves what is on this screen over it (their copy stays in History).{' '}
          <strong>Use theirs</strong> shows their copy instead.{' '}
          <strong>Keep both</strong> saves yours as a new note.
        </Typography>
      </DialogContentText>
    </GeekDialog>
  );
}
