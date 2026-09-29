/**
 * The ThingGeek mark: a short strip of black Dymo tape with an embossed "T"
 * — the label maker's raised white letter, clipped cutter corners and a
 * glossy sheen along the top edge. The same drawing as the app icon
 * (public/icons/icon.svg), cropped square for small sizes. Used in the brand,
 * the boot screen, empty states and the members-only page; never in working
 * chrome.
 *
 * Tape colours come from `theme.palette.tape` (the same black plastic in both
 * modes); in the dark it gets a faint edge so it lifts off the shelf.
 */
import React, { useId } from 'react';
import { Box, useTheme } from '@mui/material';

const FALLBACK_TAPE = { ground: '#121110', top: '#34312D', ink: '#F4F1EA', edgeDark: 'rgba(255, 255, 255, 0.16)' };

// Tape body with clipped corners, and the T, in a 32x32 box.
const TAPE_PATH = 'M1.5 7 L3.5 5 H28.5 L30.5 7 V25 L28.5 27 H3.5 L1.5 25 Z';
const T_PATH = 'M8.6 9.4 H23.4 V13.6 H18.1 V22.8 H13.9 V13.6 H8.6 Z';

export default function TagMark({ size = 28, title, sx }) {
  const theme = useTheme();
  const tape = { ...FALLBACK_TAPE, ...(theme.palette?.tape || {}) };
  const isDark = theme.palette?.mode === 'dark';
  const uid = useId().replace(/:/g, '');
  const bodyId = `tm-body-${uid}`;
  const sheenId = `tm-sheen-${uid}`;

  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      sx={{ width: size, height: size, display: 'block', flexShrink: 0, ...sx }}
    >
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tape.top} />
          <stop offset="0.22" stopColor={tape.ground} />
          <stop offset="0.9" stopColor={tape.ground} />
          <stop offset="1" stopColor={tape.top} stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g transform="rotate(-4 16 16)">
        <path
          d={TAPE_PATH}
          fill={`url(#${bodyId})`}
          stroke={isDark ? tape.edgeDark : 'none'}
          strokeWidth={isDark ? 0.75 : 0}
        />
        <path d="M2.5 6.6 L4 5.6 H28 L29.5 6.6 V11 H2.5 Z" fill={`url(#${sheenId})`} />
        {/* The embossed letter: the dent's shadow, a lit top edge, the raised plastic. */}
        <path d={T_PATH} fill="#000000" fillOpacity="0.7" transform="translate(0.35 0.9)" />
        <path d={T_PATH} fill="#FFFFFF" transform="translate(-0.2 -0.35)" />
        <path d={T_PATH} fill={tape.ink} />
      </g>
    </Box>
  );
}
