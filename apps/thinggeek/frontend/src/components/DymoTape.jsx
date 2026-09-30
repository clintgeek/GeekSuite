/**
 * DymoTape — the Label Maker signature: a strip of embossing tape with
 * raised letters. For places and labels (the breadcrumb, the Where rows, the
 * place on a row), page titles and section headings — the way a garage shelf
 * is labelled. Never for body copy or ordinary buttons (the one exception is
 * the orange "Add a thing" strip on the first-run empty state, which is a
 * real button wearing tape).
 *
 * Drawn from photos of real 1960s–80s Dymo output (2026-09-30, after Chef:
 * "make it appear a little more embossed … the labels would have been
 * square"):
 *   - flat glossy vinyl, cut SQUARE at both ends, with a gloss along the top
 *     edge and a soft specular streak across it;
 *   - the wheel strikes at a FIXED PITCH: every character, an I or a space
 *     included, takes the same cell, and faint die seams show between cells;
 *   - a struck letter is a rounded single-weight glyph pushed up out of the
 *     plastic, which whitens under the stress: a bright rim, a slightly
 *     tinted face, a hard shadow below-right and a lit edge above-left — and
 *     each sits a hair off the line (stable per text).
 *
 * Real text, always: the name as typed lives in ONE visually hidden span —
 * that is the tape's `textContent`, what `getByText` finds, and what a screen
 * reader says ("Garage", not "G a r a g e": per-character boxes are read
 * letter by letter by Chrome's accessibility tree). The struck cells are
 * aria-hidden and draw their letters with generated content
 * (`content: attr(data-ch)`), so they add nothing to the text at all.
 *
 * `tone` picks the refill (theme TAPE_TONES): black for locations and the
 * default, blue for containers, red for attention, green for done, orange for
 * the one primary action. The letter face clears 4.5:1 on each tone's
 * lightest ground (__tests__/theme/labelMakerContrast.test.js).
 *
 * The tilt is static (≤0.6°) and derived from the text. Pass `tilt={false}`
 * inside dense lists or where it would fight alignment.
 */
import React from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import { TAPE, TAPE_FILL_ALPHA, TAPE_FONT, TAPE_TONES } from '../theme/theme';
import { visuallyHidden } from '../utils/a11y';

const SIZES = {
  sm: { fontSize: '0.75rem', px: '6px', py: '2px', minHeight: 20 },
  md: { fontSize: '0.875rem', px: '8px', py: '3px', minHeight: 24 },
  lg: { fontSize: '1.0625rem', px: '10px', py: '4px', minHeight: 30 },
  xl: { fontSize: '1.375rem', px: '14px', py: '6px', minHeight: 40 },
};

/** One character cell of the embossing wheel, in em. */
export const CELL_EM = 0.86;

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

// Die seams between cells, a gloss along the top edge, a shade along the
// bottom, and one soft specular streak.
const seams = `repeating-linear-gradient(90deg, transparent 0 calc(${CELL_EM}em - 1px), rgba(0,0,0,0.16) calc(${CELL_EM}em - 1px) ${CELL_EM}em)`;
const edges = 'linear-gradient(180deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 16%, rgba(255,255,255,0.03) 22%, transparent 30%, transparent 76%, rgba(0,0,0,0.20) 100%)';
const streak = 'linear-gradient(100deg, transparent 18%, rgba(255,255,255,0.07) 30%, rgba(255,255,255,0.11) 38%, transparent 52%)';

/** The struck cells: aria-hidden, one fixed-pitch box per character. */
function StruckLetters({ text, darkInk, ink }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid="dymo-letters"
      sx={{
        // One filter for the whole strip of letters (not one per letter):
        // the hard shadow of a raised glyph, its soft falloff, the lit edge.
        filter: darkInk
          ? 'drop-shadow(0.03em 0.07em 0 rgba(120,50,0,0.55)) drop-shadow(-0.02em -0.035em 0 rgba(255,255,255,0.45))'
          : 'drop-shadow(0.03em 0.07em 0 rgba(0,0,0,0.8)) drop-shadow(0 0.1em 0.06em rgba(0,0,0,0.35)) drop-shadow(-0.02em -0.035em 0 rgba(255,255,255,0.28))',
        '& > span': {
          display: 'inline-block',
          width: `${CELL_EM}em`,
          textAlign: 'center',
          position: 'relative',
        },
        '& > span::before': {
          content: 'attr(data-ch)',
          color: alpha(ink, TAPE_FILL_ALPHA),
          WebkitTextStroke: `0.045em ${ink}`,
          paintOrder: 'stroke fill',
        },
      }}
    >
      {Array.from(text).map((ch, i) => (
        // Keyed by index: a fixed string, never reordered.
        <span key={i} data-ch={ch === ' ' ? '' : ch} style={{ top: `${letterOffset(text, i)}em` }} />
      ))}
    </Box>
  );
}

export default function DymoTape({ children, size = 'md', tone = 'black', tilt = true, title, sx, innerSx, component = 'span', ...rest }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const s = SIZES[size] ?? SIZES.md;
  const t = TAPE_TONES[tone] ?? TAPE_TONES.black;
  const text = typeof children === 'string' ? children : '';
  const angle = tilt ? tapeTilt(text) : 0;

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
          position: 'relative',
          display: 'block',
          minWidth: 0,
          maxWidth: '100%',
          minHeight: s.minHeight,
          boxSizing: 'border-box',
          px: s.px,
          py: s.py,
          // Cut square: a hair of rounding only so the edge doesn't alias.
          borderRadius: '1px',
          backgroundColor: t.body,
          backgroundImage: `${streak}, ${edges}, ${seams}`,
          backgroundPosition: `0 0, 0 0, ${s.px} 0`,
          boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.45)',
          color: t.ink,
          fontFamily: TAPE_FONT,
          fontWeight: 600,
          fontSize: s.fontSize,
          lineHeight: 1.3,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...innerSx,
        }}
      >
        {text ? (
          <>
            <Box component="span" sx={visuallyHidden}>
              {text}
            </Box>
            <StruckLetters text={text} darkInk={tone === 'orange'} ink={t.ink} />
          </>
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}
