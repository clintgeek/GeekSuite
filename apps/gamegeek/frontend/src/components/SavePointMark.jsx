/**
 * The Save Point mark: a pixel-drawn save icon, in arcade colours — a cyan
 * disk with an ink keyline (so it holds on any ground, the ink marquee
 * included), a cream shutter and a magenta label.
 * Plan §5.1 keeps the pixel motif to the brand, empty states and the login
 * splash — never in working chrome.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';

export default function SavePointMark({ size = 28, title, sx }) {
  const theme = useTheme();
  const a = theme.palette.arcade ?? {};
  const ink = a.ink ?? '#0C0A12';
  const body = a.cyan ?? '#22E4FF';
  const shutter = a.paperInk ?? '#F6F1FF';
  const label = a.magenta ?? theme.palette.primary.main;
  return (
    <Box
      component="svg"
      viewBox="0 0 16 16"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      shapeRendering="crispEdges"
      sx={{ width: size, height: size, display: 'block', flexShrink: 0, ...sx }}
    >
      <rect x="0" y="0" width="16" height="16" fill={ink} />
      <rect x="1" y="1" width="14" height="14" fill={body} />
      <rect x="4" y="1" width="8" height="5" fill={ink} />
      <rect x="5" y="1" width="6" height="4" fill={shutter} />
      <rect x="9" y="2" width="1" height="2" fill={ink} />
      <rect x="3" y="8" width="10" height="7" fill={ink} />
      <rect x="4" y="9" width="8" height="6" fill={label} />
      <rect x="5" y="11" width="6" height="1" fill={ink} opacity="0.7" />
      <rect x="5" y="13" width="4" height="1" fill={ink} opacity="0.7" />
    </Box>
  );
}
