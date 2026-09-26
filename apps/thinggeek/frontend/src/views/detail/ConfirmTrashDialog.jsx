import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

export default function ConfirmTrashDialog({ open, onClose, title, trashDays = 30, onConfirm }) {
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
      title="Move to Trash?"
      mode="window"
      primaryAction={
        <Button variant="contained" color="error" onClick={confirm} disabled={busy}>
          {busy ? 'Moving…' : 'Move to Trash'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
          Keep it
        </Button>
      }
    >
      <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>
        <b>{title}</b> leaves the library for everyone in the household. It stays in the Trash for {trashDays} days — restore it any time before then — and after that it's purged along with its photos and documents.
      </Typography>
    </GeekDialog>
  );
}
