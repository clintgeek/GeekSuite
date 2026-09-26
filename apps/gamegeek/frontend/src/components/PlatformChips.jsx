/**
 * Owned-copy platforms as small filled chips.
 *
 * Filled chips with 12px text are the harness's favourite contrast trap, so
 * the fill is the raised surface and the label is a TEXT token — never an
 * accent on its own tint. Arcade Sticker: a squared tile with a 1.5px
 * outline in the arcade line, bold caps.
 */
import React from 'react';
import { Box } from '@mui/material';
import { platformLabel, platformShort, sortPlatforms } from '../utils/vocab';

export function copyPlatforms(game) {
  const fromCopies = (game?.copies || []).map((c) => c.platform).filter(Boolean);
  return sortPlatforms(fromCopies);
}

export default function PlatformChips({ platforms = [], max = 3, long = false, sx }) {
  if (!platforms.length) return null;
  const shown = platforms.slice(0, max);
  const extra = platforms.length - shown.length;
  const chipSx = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    px: 0.875,
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    bgcolor: 'background.raised',
    color: 'text.secondary',
    border: '1.5px solid',
    borderColor: 'border',
  };
  return (
    <Box
      component="ul"
      aria-label="Platforms"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, m: 0, p: 0, listStyle: 'none', minWidth: 0, ...sx }}
    >
      {shown.map((p) => (
        <Box component="li" key={p} sx={chipSx} title={platformLabel(p)}>
          {long ? platformLabel(p) : platformShort(p)}
        </Box>
      ))}
      {extra > 0 ? (
        <Box component="li" sx={chipSx} aria-label={`and ${extra} more`}>
          +{extra}
        </Box>
      ) : null}
    </Box>
  );
}
