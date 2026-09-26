/**
 * "Save view" — name the current filter + sort. The dialog owns the name
 * field (pre-filled from the active chips: "RPG · Steam", else
 * `fallbackName`), the saving state and the toasts; the app owns the write:
 *
 *   onSave(name) → Promise   reject (or throw) to keep the dialog open; the
 *                            error's message is shown.
 *   savedMessage(name)       the success toast.
 *   whereText                where the saved view lives, for the hint line.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { GeekDialog, useToast } from '@geeksuite/ui';
import { suggestViewName } from '../facets/chips';

const defaultSaved = (name) => `Saved “${name}”.`;

export default function SaveViewDialog({
  open,
  onClose,
  onSave,
  chips = [],
  fallbackName = 'My view',
  savedMessage = defaultSaved,
  whereText = 'Open it from the sidebar any time.',
  maxLength = 60,
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(suggestViewName(chips, fallbackName));
    // Only when it opens: typing must not be overwritten by a chip change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      notify(savedMessage(trimmed), { tone: 'success' });
      onClose();
    } catch (err) {
      notify(err?.message || 'That view did not save.', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Save this view"
      maxWidth="xs"
      primaryAction={
        <Button variant="contained" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
      }
    >
      <Box component="form" onSubmit={submit} sx={{ pt: 0.5 }}>
        <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} inputProps={{ maxLength }} />
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1.5, lineHeight: 1.6 }}>
          {chips.length
            ? `${chips.length} ${chips.length === 1 ? 'filter' : 'filters'} and the current sort. ${whereText}`
            : `The current sort, with no filters. ${whereText}`}
        </Typography>
      </Box>
    </GeekDialog>
  );
}
