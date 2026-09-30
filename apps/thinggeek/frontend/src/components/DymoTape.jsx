/**
 * DymoTape — the Label Maker signature: a strip of glossy embossing tape
 * with raised letters. For PLACES and labels (the breadcrumb, the Where
 * rows, the place on a row), and — since the 2026-09-30 amplification — for
 * page titles and section headings too, the way a garage shelf is labelled.
 * Never for body copy or ordinary buttons (the one exception is the orange
 * "Add a thing" strip on the first-run empty state, which is a real button
 * wearing tape).
 *
 * Real text, always: the DOM keeps the name as typed (screen readers read
 * "Garage", not "G-A-R-A-G-E", and `textContent` is exactly the name); CSS
 * does the uppercase, the letterspacing and the emboss. Each tone's letters
 * clear 4.5:1 even on its lightest sheen band
 * (__tests__/theme/labelMakerContrast.test.js).
 *
 * `tone` picks the refill (theme TAPE_TONES): black for locations and the
 * default, blue for containers, red for attention, green for done, orange
 * for the one primary action.
 *
 * What makes it read as a real Dymo strip, from the outside in:
 *   - an outer span carries the tilt and the drop shadow;
 *   - the inner span is the tape: a vertical sheen, fine striations from the
 *     embossing wheel, a speckled plastic texture, and ends rounded the way
 *     the cutter leaves them;
 *   - the letters are "raised": stress-whitened plastic, a light edge above,
 *     a dark shadow below — and each one sits a hair off the line, the way a
 *     hand-turned wheel strikes them. The offsets are derived from the text,
 *     so the same word is always struck the same way. The letters are INLINE
 *     spans (positioned with `top`, not transforms), so the strip still
 *     ellipsizes normally and the text stays one run for assistive tech.
 *
 * The tilt is static (≤0.6°) and derived from the text too. Pass
 * `tilt={false}` inside dense lists or where it would fight alignment.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { TAPE, TAPE_FONT, TAPE_TONES } from '../theme/theme';

const SIZES = {
  sm: { fontSize: '0.75rem', px: '7px', py: '2px', radius: 3, minHeight: 20 },
  md: { fontSize: '0.875rem', px: '9px', py: '3px', radius: 4, minHeight: 24 },
  lg: { fontSize: '1.125rem', px: '12px', py: '4px', radius: 5, minHeight: 32 },
  xl: { fontSize: '1.5rem', px: '16px', py: '5px', radius: 6, minHeight: 42 },
};

export const TAPE_TONE_NAMES = Object.keys(TAPE_TONES);

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

/** A stable pseudo-random angle in [-0.6°, 0.6°] for a string. */
export function tapeTilt(text = '') {
  const step = ((hash(String(text)) % 13) + 13) % 13; // 0..12
  return (step - 6) / 10;
}

/**
 * How far letter `i` of `text` sits off the line, in em: one of
 * -0.03, -0.015, 0, 0.015, 0.03 — small enough to read as struck by hand
 * rather than as mixed letter sizes (0.05 did), big enough to see. Stable
 * for the same text.
 */
export function letterOffset(text = '', i = 0) {
  const h = hash(`${text}\u0000${i}`);
  return ((((h >>> 3) % 5) + 5) % 5 - 2) * 0.015;
}

/** The sheen for a tone: light band on top, the body, a faint lift at the bottom. */
export function tapeSheen(tone = 'black') {
  const t = TAPE_TONES[tone] ?? TAPE_TONES.black;
  return `linear-gradient(180deg, ${t.top} 0%, ${t.mid} 34%, ${t.ground} 58%, ${t.low} 88%, ${t.top} 100%)`;
}
export const TAPE_SHEEN = tapeSheen('black');

const STRIATIONS = 'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)';
// Moulded-plastic speckle: a tiny tiled turbulence, very faint.
const SPECKLE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0'/></filter><rect width='48' height='48' filter='url(#n)'/></svg>",
)}")`;

function Letters({ text }) {
  // One inline span per character; spaces stay plain text so the line can
  // still break/ellipsize at them.
  return Array.from(text).map((ch, i) =>
    ch === ' ' ? (
      ' '
    ) : (
      // Keyed by index: a fixed string, never reordered.
      <span key={i} style={{ position: 'relative', top: `${letterOffset(text, i)}em` }}>
        {ch}
      </span>
    ),
  );
}

export default function DymoTape({ children, size = 'md', tone = 'black', tilt = true, title, sx, innerSx, component = 'span', ...rest }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const s = SIZES[size] ?? SIZES.md;
  const t = TAPE_TONES[tone] ?? TAPE_TONES.black;
  const text = typeof children === 'string' ? children : '';
  const angle = tilt ? tapeTilt(text) : 0;
  // Orange tape carries DARK letters, so its emboss flips: the highlight is
  // the plastic's own, the shadow a touch lighter.
  const darkInk = tone === 'orange';

  return (
    <Box
      component={component}
      data-testid="dymo-tape"
      data-tone={tone}
      title={title}
      sx={{
        display: 'inline-flex',
        maxWidth: '100%',
        minWidth: 0,
        verticalAlign: 'middle',
        transform: angle ? `rotate(${angle}deg)` : undefined,
        filter: dark
          ? `drop-shadow(0 0 0.5px ${TAPE.edgeDark}) drop-shadow(0 1px 1.5px rgba(0,0,0,0.6))`
          : `drop-shadow(0 1px 1px ${TAPE.edgeLight}) drop-shadow(0 2px 2px rgba(60,40,15,0.18))`,
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
          borderRadius: `${s.radius}px`,
          backgroundColor: t.ground,
          backgroundImage: `${SPECKLE}, ${STRIATIONS}, ${tapeSheen(tone)}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(0,0,0,0.3)',
          color: t.ink,
          fontFamily: TAPE_FONT,
          fontWeight: 700,
          fontSize: s.fontSize,
          lineHeight: 1.25,
          letterSpacing: '0.14em',
          // The letterspacing trails the last letter; pull it back so the tape is even.
          pr: `calc(${s.px} - 0.14em)`,
          textTransform: 'uppercase',
          textShadow: darkInk
            ? '0 1px 0 rgba(255,255,255,0.35), 0 -1px 0 rgba(0,0,0,0.25)'
            : '0 -1px 0 rgba(255,255,255,0.28), 0 1px 0 rgba(0,0,0,0.95), 0 1.5px 1px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...innerSx,
        }}
      >
        {text ? <Letters text={text} /> : children}
      </Box>
    </Box>
  );
}
