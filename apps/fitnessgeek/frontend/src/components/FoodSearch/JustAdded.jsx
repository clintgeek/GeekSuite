import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CheckCircle as AddedIcon } from '@mui/icons-material';
import EntryList from './EntryList.jsx';

/** The "Just added" strip itself; see useJustAdded.jsx for when it shows. */
export default function JustAddedStrip({ items, heard, onUndo, onDone, onFix, busy = false }) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  return (
    <Box
      component="section"
      aria-label="Just added"
      data-testid="just-added"
      sx={{
        position: 'relative',
        zIndex: 1,
        // 4px theme unit: 12px a side, 10px top and bottom.
        px: 3,
        py: 2.5,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
      }}
    >
      <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '1rem', fontWeight: 700, color: 'text.primary', mb: 1 }}>
        <AddedIcon sx={{ color: primary, fontSize: 20 }} aria-hidden /> Just added
      </Typography>
      {heard && (
        <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', mb: 0.5, overflowWrap: 'anywhere' }}>
          I heard: &ldquo;{heard}&rdquo;
        </Typography>
      )}
      <EntryList items={items} onFix={onFix} busy={busy} />
      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button onClick={onUndo} disabled={busy} sx={{ minHeight: 44, fontWeight: 700, color: 'text.primary' }}>
          {/* One label per scope (A9): "Undo all" when it takes back several. */}
          {busy ? 'Undoing…' : items?.length > 1 ? 'Undo all' : 'Undo'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={onDone} disabled={busy} sx={{ minHeight: 44, fontWeight: 700, px: 2.5, boxShadow: 'none' }}>
          Done
        </Button>
      </Box>
    </Box>
  );
}
