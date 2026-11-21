import React, { useState } from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useToast } from '@geeksuite/ui';
import { graphiteTokens } from '../../theme/tokens';
import { restoreDeletedNote } from '../../hooks/useDeleteNote';

/**
 * "In Recently deleted · Restore" (C4, review 2026-11 1.19) — on a deleted
 * note opened by id (a [[link]], a bookmark, Back). The note is intact until
 * the server purges it 30 days after `deletedAt`. Same quiet shape as
 * ArchivedBanner.
 */
export default function DeletedBanner({ noteId, deletedAt, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      await restoreDeletedNote(noteId, notify);
    } finally {
      setBusy(false);
    }
  };
  const day = deletedAt ? new Date(deletedAt) : null;
  const label = day && !Number.isNaN(day.getTime())
    ? day.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  return (
    <Box
      data-deleted-banner=""
      sx={{
        display: 'flex', alignItems: 'center', gap: '8px', pl: '12px', pr: '4px', py: '2px',
        border: `1px solid ${g.border}`, borderRadius: '6px', bgcolor: g.paper, color: g.ink, ...sx,
      }}
    >
      <DeleteOutline aria-hidden sx={{ fontSize: 18, color: g.ink2, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.875rem', color: g.ink, flex: 1, minWidth: 0 }}>
        Deleted{label ? ` ${label}` : ''}
        <Box component="span" sx={{ color: g.ink2, display: { xs: 'none', sm: 'inline' } }}>
          {' '}— in Recently deleted for 30 days
        </Box>
      </Typography>
      <Button
        onClick={restore}
        disabled={busy}
        color="inherit"
        sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44, px: '12px', flexShrink: 0 }}
      >
        Restore
      </Button>
    </Box>
  );
}
