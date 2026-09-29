/**
 * DymoTape — the Label Maker signature: a strip of glossy black embossing
 * tape with raised white letters. It is for PLACES and labels only (the
 * breadcrumb, the Where rows, the "Inside …" headers, the place chip on a
 * row) — never for ordinary headings or buttons.
 *
 * Real text, always: the DOM keeps the name as typed (screen readers read
 * "Garage", not "G-A-R-A-G-E"); CSS does the uppercase, the letterspacing and
 * the emboss. White on black clears 12:1 even on the tape's lightest band
 * (asserted in __tests__/theme/labelMakerContrast.test.js).
 *
 * The look, from the outside in:
 *   - an outer span carries the tilt and the drop shadow (a `filter`, so it
 *     follows the clipped outline instead of a rectangle);
 *   - the inner span is the tape: a vertical sheen (a lighter band on top,
 *     the body, a faint lift at the bottom), fine vertical striations from
 *     the embossing wheel, and the ends clipped at the corners the way a
 *     cutter leaves them;
 *   - the letters are "raised": a light edge above and a dark shadow below.
 *
 * The tilt is static (≤0.6°) and derived from the text, so the same place is
 * always stuck on at the same angle and a re-render never wobbles it. Pass
 * `tilt={false}` inside dense lists or where it would fight alignment.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { TAPE, TAPE_FONT } from '../theme/theme';

const SIZES = {
  sm: { fontSize: '0.75rem', px: '7px', py: '2px', notch: 3, minHeight: 20 },
  md: { fontSize: '0.875rem', px: '9px', py: '3px', notch: 4, minHeight: 24 },
  lg: { fontSize: '1.125rem', px: '12px', py: '4px', notch: 5, minHeight: 32 },
};

/** A stable pseudo-random angle in [-0.6°, 0.6°] for a string. */
export function tapeTilt(text = '') {
  let h = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  const step = ((h % 13) + 13) % 13; // 0..12
  return (step - 6) / 10;
}

/** The corner-clipped outline of a cut strip of tape. */
export function tapeClip(n) {
  return `polygon(${n}px 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0 calc(100% - ${n}px), 0 ${n}px)`;
}

export const TAPE_SHEEN = `linear-gradient(180deg, ${TAPE.top} 0%, #1F1D1B 34%, ${TAPE.ground} 58%, #191715 88%, #24211E 100%)`;
const STRIATIONS = 'repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 3px)';

export default function DymoTape({ children, size = 'md', tilt = true, title, sx, innerSx, component = 'span', ...rest }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const s = SIZES[size] ?? SIZES.md;
  const text = typeof children === 'string' ? children : '';
  const angle = tilt ? tapeTilt(text) : 0;

  return (
    <Box
      component={component}
      data-testid="dymo-tape"
      title={title}
      sx={{
        display: 'inline-flex',
        maxWidth: '100%',
        minWidth: 0,
        verticalAlign: 'middle',
        transform: angle ? `rotate(${angle}deg)` : undefined,
        filter: dark
          ? `drop-shadow(0 0 0.5px ${TAPE.edgeDark}) drop-shadow(0 1px 1.5px rgba(0,0,0,0.6))`
          : `drop-shadow(0 1px 1px ${TAPE.edgeLight})`,
        ...sx,
      }}
      {...rest}
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          minWidth: 0,
          maxWidth: '100%',
          minHeight: s.minHeight,
          boxSizing: 'border-box',
          px: s.px,
          py: s.py,
          clipPath: tapeClip(s.notch),
          backgroundColor: TAPE.ground,
          backgroundImage: `${STRIATIONS}, ${TAPE_SHEEN}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.55)',
          color: TAPE.ink,
          fontFamily: TAPE_FONT,
          fontWeight: 700,
          fontSize: s.fontSize,
          lineHeight: 1.25,
          letterSpacing: '0.14em',
          // The letterspacing trails the last letter; pull it back so the tape is even.
          pr: `calc(${s.px} - 0.14em)`,
          textTransform: 'uppercase',
          textShadow: '0 -1px 0 rgba(255,255,255,0.22), 0 1px 0 rgba(0,0,0,0.95), 0 1.5px 1px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...innerSx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
