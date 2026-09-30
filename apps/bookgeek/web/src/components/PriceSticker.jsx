/**
 * PriceSticker — the one sticker in BookGeek: a round, matte label stuck on
 * a cover's corner, the way a used bookstore prices a book. It marks what's
 * waiting on the device: "On reader". Nothing else wears one.
 *
 * "Unread" had a yellow sticker for a day (2026-09-30). Chef then moved every
 * book not read / on the reader / being read to the Unread shelf — 371 of 554
 * — and a sticker on two-thirds of the library is wallpaper, not a signal.
 *
 * Round, matte, NEVER tilted, never neon — GameGeek owns tilted stickers.
 * A fill with dark ink on it (theme STICKER; usedBookstoreContrast). Text is
 * ≥12px. Decorative (aria-hidden): the shelf is already in the card's
 * caption and button label.
 */
import React from "react";
import { Box } from "@mui/material";
import { STICKER } from "../theme/theme";

/** What sticker, if any, a book wears. Pure, so it is tested alone. */
export function stickerFor(book) {
  if (!book) return null;
  if (book.shelf === "on-reader") return { tone: "onReader", lines: ["On", "reader"] };
  return null;
}

export default function PriceSticker({ book, size = 62, sx }) {
  const s = stickerFor(book);
  if (!s) return null;
  const tone = STICKER[s.tone];
  return (
    <Box
      aria-hidden="true"
      data-testid="price-sticker"
      data-tone={s.tone}
      sx={{
        position: "absolute",
        top: 6,
        left: 8,
        zIndex: 2,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        bgcolor: tone.ground,
        color: tone.ink,
        // Matte paper: a faint rim where it's pressed down, a hair of lift.
        boxShadow: `inset 0 0 0 1.5px ${tone.rim}, 0 1px 2px rgba(0,0,0,0.25)`,
        fontWeight: 700,
        fontSize: "0.75rem",
        lineHeight: 1.05,
        letterSpacing: 0,
        textTransform: "uppercase",
        pointerEvents: "none",
        ...sx,
      }}
    >
      {s.lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </Box>
  );
}
