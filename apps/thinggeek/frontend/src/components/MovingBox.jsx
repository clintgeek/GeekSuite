/**
 * A moving box, drawn in SVG: a cardboard front face with a hand-hold
 * cutout, the printed orange band with its stencilled size, packing tape
 * over the top (or the flaps open onto the dark inside), "THIS SIDE UP"
 * arrows, and a FRAGILE / HANDLE WITH CARE stamp when the thing calls for one
 * (utils/boxMarks.js decides). Pure decoration: aria-hidden, the words next
 * to it carry the meaning.
 *
 * `glyph` (a React node, usually a TypeIcon) is printed on the face above the
 * band. `open` shows the flaps up and the dim inside — the empty states and
 * Pack-a-room use it.
 */
import React, { useId } from 'react';
import { Box, useTheme } from '@mui/material';
import { BOX, LIVERY, STENCIL_FONT } from '../theme/theme';

export default function MovingBox({ size = null, care = null, open = false, glyph = null, width = 160, sx, testId = 'moving-box' }) {
  const theme = useTheme();
  const c = BOX[theme.palette.mode === 'dark' ? 'dark' : 'light'];
  const uid = useId().replace(/:/g, '');
  const scuff = `mb-scuff-${uid}`;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid={testId}
      data-size={size ?? ''}
      data-care={care ?? ''}
      data-open={open ? 'true' : 'false'}
      sx={{ position: 'relative', display: 'inline-block', width, lineHeight: 0, flexShrink: 0, ...sx }}
    >
      <svg viewBox="0 0 160 138" width="100%" role="presentation" focusable="false">
        <defs>
          <filter id={scuff} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 -2.6 1.6" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        {/* the box's shadow on the floor */}
        <ellipse cx="82" cy="130" rx="70" ry="6" fill="#000" opacity="0.22" />
        {open ? (
          <>
            {/* the dim inside, and the back flap standing up */}
            <polygon points="14,44 36,30 146,30 124,44" fill={c.hole} />
            <polygon points="36,30 146,30 150,8 42,10" fill={c.flap} stroke={c.seam} strokeWidth="1" />
            <polygon points="124,44 146,30 158,40 136,58" fill={c.side} stroke={c.seam} strokeWidth="1" />
          </>
        ) : (
          <>
            <polygon points="14,44 36,30 146,30 124,44" fill={c.flap} stroke={c.seam} strokeWidth="1" />
            {/* packing tape down the seam of the top */}
            <polygon points="74,44 96,30 106,30 84,44" fill="#E9D6B4" opacity="0.7" />
          </>
        )}
        {/* the side and the front */}
        <polygon points="124,44 146,30 146,112 124,126" fill={c.side} />
        <rect x="14" y="44" width="110" height="82" fill={c.face} />
        <rect x="14" y="44" width="110" height="82" fill={c.face} filter={`url(#${scuff})`} opacity="0.5" />
        {open ? <polygon points="14,44 124,44 116,58 22,58" fill={c.flap} stroke={c.seam} strokeWidth="1" /> : <rect x="79" y="44" width="10" height="16" fill="#E9D6B4" opacity="0.7" />}
        {/* the hand-hold cutout */}
        <rect x="52" y={open ? 63 : 52} width="34" height="9" rx="4.5" fill={c.hole} />
        {/* the printed orange band, and its stencil */}
        <rect x="14" y="84" width="110" height="20" fill={LIVERY.orange} />
        <polygon points="124,96 146,82 146,96 124,110" fill={LIVERY.deep} />
        {size ? (
          <text x="69" y="99" textAnchor="middle" fontFamily={STENCIL_FONT} fontSize="13" letterSpacing="1.5" fill={LIVERY.ink}>
            {size}
          </text>
        ) : null}
        {/* THIS SIDE UP: two arrows in the corner */}
        <g fill={c.print} opacity="0.85">
          <path d="M22 122 l5 -7 l5 7 h-3 v4 h-4 v-4 z" />
          <path d="M33 122 l5 -7 l5 7 h-3 v4 h-4 v-4 z" />
        </g>
        {care ? (
          <g transform="rotate(-7 96 118)">
            <rect x={care === 'FRAGILE' ? 74 : 60} y="109" width={care === 'FRAGILE' ? 46 : 62} height="13" fill="none" stroke="#7A140C" strokeWidth="1.5" />
            <text x={care === 'FRAGILE' ? 97 : 91} y="119" textAnchor="middle" fontFamily={STENCIL_FONT} fontSize={care === 'FRAGILE' ? 9 : 6.6} letterSpacing="0.8" fill="#7A140C">
              {care}
            </text>
          </g>
        ) : null}
      </svg>
      {glyph ? (
        <Box component="span" sx={{ position: 'absolute', left: '43%', top: open ? '58%' : '48%', transform: 'translate(-50%, -50%)', color: c.print, opacity: 0.75, display: 'flex', '& svg': { width: width * 0.16, height: width * 0.16 } }}>
          {glyph}
        </Box>
      ) : null}
    </Box>
  );
}
