/**
 * The NewsGeek mark: a folded front page — a heavy nameplate rule, a
 * headline bar and three columns of type, with the corner turned down.
 * Drawn in the current ink, so it follows the mode (as public/icons/*.svg).
 */
import React from 'react';
import { Box } from '@mui/material';

export default function GazetteMark({ size = 32, sx }) {
  return (
    <Box component="svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false" sx={{ display: 'block', flexShrink: 0, color: 'text.primary', ...sx }}>
      <path d="M8 5h24l8 8v30H8z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 5v8h8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="12" y="8.5" width="18" height="6" fill="currentColor" />
      <rect x="12" y="17" width="24" height="1.5" fill="currentColor" />
      <rect x="12" y="19.75" width="24" height="0.75" fill="currentColor" />
      <rect x="12" y="23" width="17" height="2.5" fill="currentColor" />
      <g fill="currentColor" opacity="0.7">
        <rect x="12" y="28" width="6.5" height="1.5" />
        <rect x="12" y="31.5" width="6.5" height="1.5" />
        <rect x="12" y="35" width="6.5" height="1.5" />
        <rect x="12" y="38.5" width="5" height="1.5" />
        <rect x="20.75" y="28" width="6.5" height="1.5" />
        <rect x="20.75" y="31.5" width="6.5" height="1.5" />
        <rect x="20.75" y="35" width="6.5" height="1.5" />
        <rect x="20.75" y="38.5" width="4" height="1.5" />
        <rect x="29.5" y="28" width="6.5" height="1.5" />
        <rect x="29.5" y="31.5" width="6.5" height="1.5" />
        <rect x="29.5" y="35" width="6.5" height="1.5" />
      </g>
    </Box>
  );
}
