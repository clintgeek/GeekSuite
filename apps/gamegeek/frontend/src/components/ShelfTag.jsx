/**
 * A game's shelf as an arcade sticker: the shelf's colour as a FILL, an ink
 * outline, a hard ink shadow, a 12px heavy ink label, stuck on a couple of degrees
 * crooked (each shelf leans its own way, so a grid of them looks slapped on
 * by hand, and the same shelf always leans the same way). Mixed case, not
 * caps: "Abandoned" has to fit beside the star strip on a 150px card.
 *
 * Contrast is measured against the fill itself (the 12px filled-chip rule):
 * every shelf fill clears 6:1 with the ink. readableOn stays in the path so a
 * fill that ever lands dark still gets a readable label.
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

const LEANS = [-2, 1.5, -1, 2, -1.5, 1];

function shelfLean(shelf) {
  const s = String(shelf || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n += s.charCodeAt(i);
  return LEANS[n % LEANS.length];
}

export default function ShelfTag({ shelf, label, sx }) {
  const theme = useTheme();
  const { dot: fill } = useShelfTone(shelf);
  if (!label) return null;
  const inkBase = theme.palette.arcade?.ink ?? '#000';
  const ink = readableOn(inkBase, fill);
  return (
    <Box
      component="span"
      data-shelf-sticker={shelf}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 0,
        height: 22,
        px: 0.625,
        borderRadius: '4px',
        bgcolor: fill,
        color: ink,
        border: `2px solid ${inkBase}`,
        boxShadow: `2px 2px 0 0 ${inkBase}`,
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: 0,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        transform: `rotate(${shelfLean(shelf)}deg)`,
        ...sx,
      }}
    >
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Box>
    </Box>
  );
}
