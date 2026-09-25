/**
 * StarRating — five stars, one control (bookgeek's design, GameGeek's paint).
 *
 * One 44px-tall strip where each star owns a fifth of the width, not five
 * 44px buttons (they do not fit under a 170px card). Semantically a slider:
 * arrows, Home/End or 1–5 from the keyboard. It sits BESIDE whatever opens
 * the game, never inside it, and stops its own events.
 *
 * Tapping the current rating is a no-op, not a clear — a mis-tap must never
 * delete a rating. `allowClear` adds a Backspace/Delete path for the detail
 * sheet, where clearing is deliberate.
 */
import React, { useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { Star as StarFull, StarHalf, StarBorder as StarEmpty } from '@mui/icons-material';
import { starFill } from '../utils/rateGame';
import { ratingMeaningFor, ratingMeaningLine } from '../utils/tasteModel';

const ICONS = { full: StarFull, half: StarHalf, empty: StarEmpty };
const SIZES = { inline: 17, row: 20, hero: 28 };

export default function StarRating({ value, onChange, onPreview, label, variant = 'inline', allowClear = false, sx }) {
  const theme = useTheme();
  const ref = useRef(null);
  const [hover, setHoverState] = useState(null);

  const setHover = (n) => {
    setHoverState(n);
    onPreview?.(n);
  };

  const rated = typeof value === 'number' && value > 0;
  const shown = hover ?? (rated ? value : 0);
  // Native tooltip for compact contexts (library cards, rows) — visible text
  // stays out of the card; a hover/focus title is enough there. The hero
  // variant also gets it for free; RatingSection additionally renders a
  // visible live line for that case.
  const title = shown ? ratingMeaningLine(shown) : 'Not rated';

  const starAt = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return null;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width - 0.01);
    return Math.min(5, Math.floor(x / (r.width / 5)) + 1);
  };

  const commit = (n) => {
    if (n === undefined || n === value) return;
    if (n === null && !rated) return;
    onChange?.(n);
  };

  const stop = (e) => e.stopPropagation();

  const onKeyDown = (e) => {
    const current = rated ? Math.round(value) : 0;
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, current + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, current - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    else if (/^[1-5]$/.test(e.key)) next = Number(e.key);
    else if (allowClear && (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0')) next = null;
    if (next !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      commit(next);
    }
  };

  const filled = theme.palette.star ?? theme.palette.warning.main;
  const empty = theme.palette.text.secondary;
  const size = SIZES[variant] ?? SIZES.inline;

  return (
    <Box
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label ? `Rate ${label}` : 'Rating'}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={rated ? value : 0}
      aria-valuetext={rated ? `${value} of 5 stars — ${ratingMeaningFor(value)?.short ?? ''}` : 'Not rated'}
      title={title}
      data-testid="star-rating"
      onClick={(e) => {
        e.stopPropagation();
        commit(starAt(e.clientX));
      }}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') setHover(starAt(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 44,
        width: '100%',
        cursor: 'pointer',
        userSelect: 'none',
        touchAction: 'manipulation',
        borderRadius: '6px',
        outline: 'none',
        '&:focus-visible': { boxShadow: `0 0 0 2px ${theme.palette.primary.main}` },
        ...sx,
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = starFill(i, shown);
        const Icon = ICONS[fill];
        return (
          <Box key={i} aria-hidden="true" data-fill={fill} sx={{ flex: 1, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <Icon sx={{ fontSize: size, color: fill === 'empty' ? empty : filled }} />
          </Box>
        );
      })}
    </Box>
  );
}
