/** ⋯ More → "Wrong match? Unlink" — clears what enrichment filled in, keeps your own edits. */
import React, { useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

export default function UnlinkMetadataDialog({ open, onClose, title, onConfirm }) {
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
      title="Unlink metadata?"
      mode="window"
      primaryAction={
        <Button variant="contained" color="error" onClick={confirm} disabled={busy}>
          {busy ? 'Unlinking…' : 'Unlink'}
        </Button>
      }
      secondaryAction={<Button onClick={onClose} sx={{ color: 'text.secondary' }}>Keep it</Button>}
    >
      <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>
        This removes the details and cover art that were filled in automatically for <b>{title}</b> — anything
        you've edited yourself stays. The metadata worker won't touch this game again.
      </Typography>
    </GeekDialog>
  );
}
