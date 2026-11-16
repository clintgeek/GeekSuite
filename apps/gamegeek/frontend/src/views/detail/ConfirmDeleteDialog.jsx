import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

/**
 * Delete is household-wide but recoverable (S-D1, 2026-11-16): the gateway
 * keeps a snapshot and Settings → Deleted games restores it. Say all three
 * things plainly — who loses it, that Playnite won't re-add it, and the way back.
 */
export default function ConfirmDeleteDialog({ open, onClose, title, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Delete this game?"
      mode="window"
      primaryAction={
        <Button variant="contained" color="error" onClick={confirm} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      }
      secondaryAction={<Button onClick={onClose} sx={{ color: 'text.secondary' }}>Keep it</Button>}
    >
      <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>
        <b>{title}</b> will be removed for everyone in the household, with everyone's shelf, rating and notes for it.
      </Typography>
      <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.6, mt: 1.5 }}>
        Playnite won't bring it back on the next import, even if it's still in your Playnite library. You can restore it — with everyone's shelves, ratings and notes — from Settings → Deleted games.
      </Typography>
    </GeekDialog>
  );
}
