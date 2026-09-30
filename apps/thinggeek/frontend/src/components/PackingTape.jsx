/**
 * A strip of clear packing tape holding a card to the carton — pure
 * decoration (aria-hidden, no pointer events). It straddles the card's top
 * edge, so the card it sits on needs `position: relative` and a little top
 * padding; it never covers a word.
 *
 * The ends are torn, not cut: a zigzag clip-path. Translucent, so the card
 * edge shows through it the way real tape does.
 */
import React from 'react';
import { Box } from '@mui/material';

const TORN = 'polygon(0 8%, 3% 0, 6% 12%, 9% 2%, 91% 2%, 94% 12%, 97% 0, 100% 8%, 100% 92%, 97% 100%, 94% 88%, 91% 98%, 9% 98%, 6% 88%, 3% 100%, 0 92%)';

export default function PackingTape({ width = 112, rotate = -2, sx }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="packing-tape"
      sx={{
        position: 'absolute',
        top: -11,
        left: '50%',
        width,
        height: 22,
        transform: `translateX(-50%) rotate(${rotate}deg)`,
        pointerEvents: 'none',
        clipPath: TORN,
        bgcolor: 'packing.body',
        backgroundImage: (t) => `linear-gradient(180deg, ${t.palette.packing.sheen} 0 30%, transparent 30% 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 9px)`,
        boxShadow: (t) => `inset 0 0 0 1px ${t.palette.packing.edge}`,
        zIndex: 1,
        ...sx,
      }}
    />
  );
}
