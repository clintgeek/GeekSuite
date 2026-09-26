/**
 * The ThingGeek mark: an asset tag — the stringed tag you tie to something
 * you mean to keep track of — in registry green with a brass eyelet. Used in
 * the brand, the boot screen, empty states and the members-only page; never
 * in working chrome.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';

export default function TagMark({ size = 28, title, sx }) {
  const theme = useTheme();
  const tag = theme.palette.primary.main;
  const brass = theme.palette.brass ?? '#A87B2B';
  const ground = theme.palette.background.paper;
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      sx={{ width: size, height: size, display: 'block', flexShrink: 0, ...sx }}
    >
      <g transform="rotate(-14 16 16)">
        <path d="M11 8 H24.5 a2.5 2.5 0 0 1 2.5 2.5 V21.5 a2.5 2.5 0 0 1 -2.5 2.5 H11 L5 16 Z" fill={tag} />
        <circle cx="10.6" cy="16" r="1.9" fill={ground} stroke={brass} strokeWidth="1.3" />
        <rect x="14.5" y="12.6" width="9.5" height="1.7" rx="0.85" fill={ground} />
        <rect x="14.5" y="16.3" width="6.5" height="1.7" rx="0.85" fill={ground} opacity="0.7" />
        <rect x="14.5" y="20" width="4" height="1.7" rx="0.85" fill={ground} opacity="0.45" />
      </g>
      <path d="M9 17.2 C 6.6 19.8, 5.8 23.4, 7.2 27.4" fill="none" stroke={brass} strokeWidth="1.2" strokeLinecap="round" />
    </Box>
  );
}
