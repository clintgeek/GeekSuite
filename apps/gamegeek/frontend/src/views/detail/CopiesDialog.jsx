/**
 * The copies editor — platform, format, storefront per copy. This is how a
 * game becomes "owned on GOG / Epic / Amazon / Luna": a PC copy whose
 * storefront says so. The array is replaced whole on save (typeDefs:
 * GameCopyInput), so existing copies keep their ids and removed ones go.
 */
import React, { useEffect, useState } from 'react';
import { Button, Typography } from '@mui/material';
import { GeekDialog, useToast } from '@geeksuite/ui';
import CopyRowsEditor from '../../components/CopyRowsEditor';

export function copiesToInput(rows) {
  return rows
    .filter((r) => r.platform)
    .map((r) => {
      const out = { platform: r.platform };
      if (r.id) out.id = r.id;
      if (r.format) out.format = r.format;
      if (r.storefront) out.storefront = r.storefront;
      if (r.acquiredAt) out.acquiredAt = r.acquiredAt;
      if (r.notes) out.notes = r.notes;
      return out;
    });
}

export default function CopiesDialog({ open, onClose, game, vocab, defaultPlatform, onSave }) {
  const { notify } = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setRows((game?.copies || []).map(({ __typename, ...c }) => c));
  }, [open, game]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ copies: copiesToInput(rows) });
      onClose();
    } catch {
      notify('Copies did not save.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Copies we own"
      maxWidth="sm"
      primaryAction={<Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>}
      secondaryAction={<Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancel</Button>}
    >
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 2, lineHeight: 1.6 }}>
        One row per copy. Own it on GOG, Epic, Amazon or Luna? Add a PC copy and pick that storefront.
      </Typography>
      <CopyRowsEditor rows={rows} onChange={setRows} vocab={vocab} defaultPlatform={defaultPlatform || game?.platformsAvailable?.[0]} />
    </GeekDialog>
  );
}
