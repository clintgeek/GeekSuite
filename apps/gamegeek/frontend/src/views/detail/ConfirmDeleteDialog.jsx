import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

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
        <b>{title}</b> will be removed from the household library — for everyone, with their shelves, ratings, sessions and hours for it. This can't be undone.
      </Typography>
    </GeekDialog>
  );
}
