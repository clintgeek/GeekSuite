/**
 * "● Playing" — a game's shelf as one 12px caption. The tone is a domain
 * colour painted as text, so it goes through readableOn against the surface
 * it actually lands on (the card, by default).
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { readableOn } from '@geeksuite/ui';

export function useShelfTone(shelf, surfaceKey = 'card') {
  const theme = useTheme();
  const tones = theme.palette.shelf || {};
  const raw = tones[shelf] || (String(shelf || '').startsWith('custom-') ? tones.custom : tones.unshelved) || theme.palette.text.secondary;
  const surface = theme.palette.background[surfaceKey] || theme.palette.background.paper;
  return { dot: raw, ink: readableOn(raw, surface) };
}

export default function ShelfTag({ shelf, label, surface = 'card', sx }) {
  const { dot, ink } = useShelfTone(shelf, surface);
  if (!label) return null;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.625,
        minWidth: 0,
        fontSize: '0.75rem',
        fontWeight: 600,
        color: ink,
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: dot, flexShrink: 0, boxShadow: `0 0 6px ${dot}66` }} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
    </Box>
  );
}
