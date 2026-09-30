/**
 * ShelfPlank — the wood a row of books stands on (Used Bookstore).
 *
 * Drawn under each cover in the library grid; `bleed` pushes it past the
 * card's own edges by half the grid gap on each side, so neighbouring planks
 * meet and a row of cards reads as one continuous shelf. Decorative:
 * aria-hidden, no pointer events.
 *
 *   top face    a lighter strip the books stand on
 *   front face  the plank's edge, with a faint grain
 *   shadow      a soft shadow cast on the wall below
 */
import React from "react";
import { Box } from "@mui/material";

export const PLANK_HEIGHT = 12;

export default function ShelfPlank({ bleed = 6, sx }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="shelf-plank"
      sx={(t) => {
        const w = t.palette.wood;
        return {
          position: "relative",
          height: PLANK_HEIGHT,
          mx: `-${bleed}px`,
          pointerEvents: "none",
          backgroundImage: [
            // Grain runs along the plank: a few long, faint, uneven streaks
            // on the front face (vertical ticks read as a ruler).
            `linear-gradient(180deg, transparent 0 6px, ${w.grain} 6px 7px, transparent 7px 9px, ${w.grain} 9px 9.5px, transparent 9.5px)`,
            `repeating-linear-gradient(94deg, transparent 0 140px, rgba(255,255,255,0.05) 140px 180px, transparent 180px 260px)`,
            `linear-gradient(180deg, rgba(255,255,255,0.18) 0, transparent 2px)`,
            `linear-gradient(180deg, ${w.top} 0, ${w.top} 4px, ${w.front} 4px, ${w.front} calc(100% - 1px), ${w.edge} calc(100% - 1px))`,
          ].join(", "),
          boxShadow: "0 5px 6px -3px rgba(30, 15, 5, 0.35)",
          ...(typeof sx === "function" ? sx(t) : sx),
        };
      }}
    />
  );
}
