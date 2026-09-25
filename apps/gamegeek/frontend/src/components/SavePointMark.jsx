/**
 * The Save Point mark: a pixel-drawn save icon with a phosphor label slot.
 * Plan §5.1 keeps the pixel motif to the brand, empty states and the login
 * splash — never in working chrome.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';

export default function SavePointMark({ size = 28, title, sx }) {
  const theme = useTheme();
  const body = theme.palette.mode === 'dark' ? '#3A4557' : '#2B3748';
  const shutter = theme.palette.mode === 'dark' ? '#9AA5B6' : '#9AA5B6';
  const glow = theme.palette.phosphor?.main ?? theme.palette.primary.main;
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
      <rect x="1" y="1" width="14" height="14" fill={body} />
      <rect x="2" y="2" width="12" height="12" fill={body} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      <rect x="4" y="1" width="8" height="5" fill={shutter} />
      <rect x="9" y="2" width="2" height="3" fill={body} />
      <rect x="3" y="8" width="10" height="6" fill={glow} />
      <rect x="4" y="10" width="6" height="1" fill={body} opacity="0.55" />
      <rect x="4" y="12" width="4" height="1" fill={body} opacity="0.55" />
    </Box>
  );
}
