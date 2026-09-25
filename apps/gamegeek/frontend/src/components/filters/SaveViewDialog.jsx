/**
 * "Save view" — name the current filter + sort and keep it on the profile.
 * It saves the WHOLE GameFilterInput as `filter` plus `sortBy`/`sortDir`
 * (DOCS/TAGS_AND_FILTERS.md §B1 "Saved filters"); the view then lives in the
 * sidebar under Shelves.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { useMutation } from '@apollo/client';
import { GeekDialog, useToast } from '@geeksuite/ui';
import { SAVE_GAME_FILTER } from '../../graphql/mutations';
import { suggestName } from './filterUi';

export default function SaveViewDialog({ open, onClose, filterInput, sort, dir, chips = [], sortLabel = 'My view' }) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [save, { loading }] = useMutation(SAVE_GAME_FILTER);

  useEffect(() => {
    if (open) setName(suggestName(chips, sortLabel));
    // Only when it opens: typing must not be overwritten by a chip change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await save({
        variables: {
          input: {
            name: trimmed,
            filter: filterInput ?? {},
            sortBy: sort,
            sortDir: sort === 'random' ? 'asc' : dir,
          },
        },
      });
      notify(`Saved “${trimmed}”. It's in the sidebar under Shelves.`, { tone: 'success' });
      onClose();
    } catch (err) {
      notify(err?.message || 'That view did not save.', { tone: 'error' });
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title="Save this view"
      maxWidth="xs"
      primaryAction={
        <Button variant="contained" onClick={submit} disabled={loading || !name.trim()}>
          {loading ? 'Saving…' : 'Save'}
        </Button>
      }
      secondaryAction={
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
      }
    >
      <Box component="form" onSubmit={submit} sx={{ pt: 0.5 }}>
        <TextField
          autoFocus
          fullWidth
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 60 }}
        />
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1.5, lineHeight: 1.6 }}>
          {chips.length
            ? `${chips.length} ${chips.length === 1 ? 'filter' : 'filters'} and the current sort. Open it from the sidebar any time.`
            : 'The current sort, with no filters. Open it from the sidebar any time.'}
        </Typography>
      </Box>
    </GeekDialog>
  );
}
