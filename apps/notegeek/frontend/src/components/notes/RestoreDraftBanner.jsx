import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import { graphiteTokens } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/dateUtils';

/**
 * "Unsaved changes from 5m ago · Restore · Discard" (review 2026-11, 1.2).
 *
 * This device kept a copy of edits the server never acknowledged — the app
 * was frozen or closed before its save went out. Restoring puts them back on
 * screen (and they save like any edit); Discard forgets the device copy.
 * Same quiet shape as ArchivedBanner: nothing is wrong yet, nothing is lost.
 */
export default function RestoreDraftBanner({ savedAt, onRestore, onDiscard, sx }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const when = savedAt ? formatRelativeTime(savedAt) : '';
  const button = { textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44, px: '12px', flexShrink: 0 };
  return (
    <Box
      data-restore-draft=""
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px 8px',
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
      <HistoryOutlined aria-hidden sx={{ fontSize: 18, color: g.ink2, flexShrink: 0 }} />
      {/* A basis, not `flex: 1`: with no floor the sentence was squeezed to
          one word a line on a phone while the two buttons kept the row. Now
          the pair of buttons drops to its own line (right-aligned) when the
          sentence and both do not fit. */}
      <Typography sx={{ fontSize: '0.875rem', color: g.ink, flex: '1 1 180px', minWidth: 0, py: '8px' }}>
        Unsaved changes on this device{when ? ` from ${when}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', ml: 'auto', flexShrink: 0 }}>
        <Button onClick={onDiscard} color="inherit" sx={{ ...button, fontWeight: 500 }}>
          Discard
        </Button>
        <Button onClick={onRestore} color="inherit" sx={button}>
          Restore unsaved changes
        </Button>
      </Box>
    </Box>
  );
}
