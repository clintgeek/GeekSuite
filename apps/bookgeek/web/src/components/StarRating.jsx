/**
 * StarRating — five stars, one control.
 *
 * WHY ONE CONTROL AND NOT FIVE BUTTONS. The mobile harness holds every
 * interactive element to 44x44 on a phone, and a phone-width cover is about
 * 160px — five 44px stars do not fit. So this is a single 44px-tall strip, and
 * WHERE you tap picks the star: each star owns a fifth of the width, the zones
 * touch, and a tap always lands on one of them. Semantically it is a slider
 * (`role="slider"`), which is also what makes it work from the keyboard
 * (arrows, Home/End, or just press 1-5) and read sensibly to a screen reader.
 *
 * It is placed BESIDE whatever opens the book, never inside it — a control
 * inside a <button> is invalid HTML and every tap would open the book too —
 * and it stops its own events so the card underneath never sees them.
 *
 * Whole stars in, halves out: tapping sets 1-5, but a stored 3.5 still draws
 * three and a half (see utils/rating.js). Tapping the rating a book already
 * has is a no-op rather than a clear — on a grid you also tap to open things,
 * and a mis-tap that silently deleted a rating is exactly the wrong failure.
 * Clearing lives in the edit dialog.
 */
import React, { useRef, useState } from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import {
  Star as StarFull,
  StarHalf,
  StarBorder as StarEmpty,
} from '@mui/icons-material';
import { starFill } from '../utils/rating';

const ICONS = { full: StarFull, half: StarHalf, empty: StarEmpty };

export default function StarRating({
  value,
  onChange,
  label,
  variant = 'cover', // 'cover' — on artwork, over a scrim | 'row' — on the page surface
  sx,
}) {
  const theme = useTheme();
  const ref = useRef(null);
  const [hover, setHover] = useState(null);

  const rated = typeof value === 'number' && value > 0;
  const shown = hover ?? (rated ? value : 0);

  const starAt = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return null;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width - 0.01);
    return Math.min(5, Math.floor(x / (r.width / 5)) + 1);
  };

  const commit = (n) => {
    if (n == null || n === value) return;
    onChange?.(n);
  };

  const stop = (e) => e.stopPropagation();

  const onKeyDown = (e) => {
    const current = rated ? Math.round(value) : 0;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, current + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, current - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    else if (/^[1-5]$/.test(e.key)) next = Number(e.key);
    if (next != null) {
      e.preventDefault();
      e.stopPropagation();
      commit(next);
    }
  };

  const onCover = variant === 'cover';
  // Amber on both surfaces; the empty outline is white over the cover's scrim
  // and the muted text colour on the page.
  const filled = theme.palette.progress?.main ?? theme.palette.warning.main;
  const empty = onCover ? alpha('#fff', 0.85) : theme.palette.text.secondary;

  return (
    <Box
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label ? `Rate ${label}` : 'Rating'}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={rated ? value : 0}
      aria-valuetext={rated ? `${value} of 5 stars` : 'Not rated'}
      data-testid="star-rating"
      onClick={(e) => {
        e.stopPropagation();
        commit(starAt(e.clientX));
      }}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      // Hover preview for a real mouse only. On touch a synthetic mouse event
      // would leave a "hover" stuck on the tapped star with no mouseleave to
      // clear it — and if the save then failed and reverted, the stars would
      // go on showing the rating that did not save.
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
          <Box
            key={i}
            aria-hidden="true"
            data-fill={fill}
            sx={{ flex: 1, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <Icon
              sx={{
                fontSize: onCover ? 22 : 20,
                color: fill === 'empty' ? empty : filled,
                filter: onCover ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' : 'none',
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
