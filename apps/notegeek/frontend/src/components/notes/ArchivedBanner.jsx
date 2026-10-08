import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import { graphiteTokens } from '../../theme/tokens';

function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * "Archived Oct 8, 2026 · Restore" (spec U6) — on a note opened directly while
 * it is archived. Quiet, on the sheet: the note is intact, nothing is wrong.
 */
export default function ArchivedBanner({ archivedAt, onRestore, busy = false, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const day = formatDay(archivedAt);
  return (
    // Not a role="status": the editor's SaveStatus is the page's one live
    // region (DOCS/CONTEXT.md §7), and this does not change while you read.
    <Box
      data-archived-banner=""
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        pl: '12px',
        pr: '4px',
        py: '2px',
        border: `1px solid ${g.border}`,
        borderRadius: '6px',
        bgcolor: g.paper,
        color: g.ink,
        ...sx,
      }}
    >
      <ArchiveOutlined aria-hidden sx={{ fontSize: 18, color: g.ink2, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.875rem', color: g.ink, flex: 1, minWidth: 0 }}>
        Archived{day ? ` ${day}` : ''}
        <Box component="span" sx={{ color: g.ink2, display: { xs: 'none', sm: 'inline' } }}>
          {' '}— out of your lists, tags and search
        </Box>
      </Typography>
      <Button
        onClick={onRestore}
        disabled={busy}
        color="inherit"
        sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44, px: '12px', flexShrink: 0 }}
      >
        Restore
      </Button>
    </Box>
  );
}
