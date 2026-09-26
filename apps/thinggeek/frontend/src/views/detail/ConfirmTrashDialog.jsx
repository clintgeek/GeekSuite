import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

/**
 * "Move to Trash?" — and, for something that holds things, what happens to
 * them: they stay where they are (inside something in the Trash) until it is
 * restored, and move up to its parent when it is purged.
 */
export default function ConfirmTrashDialog({ open, onClose, title, trashDays = 30, onConfirm, contentsCount = 0, parentName = null }) {
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
      {contentsCount ? (
        <Typography data-testid="trash-contents-note" sx={{ fontSize: '0.9375rem', lineHeight: 1.6, mt: 1.5 }}>
          {contentsCount === 1 ? 'The 1 thing inside stays' : `The ${contentsCount} things inside stay`} where {contentsCount === 1 ? 'it is' : 'they are'}. If {title} is purged, {contentsCount === 1 ? 'it moves' : 'they move'} up to {parentName || 'the top level'}.
        </Typography>
      ) : null}
    </GeekDialog>
  );
}
