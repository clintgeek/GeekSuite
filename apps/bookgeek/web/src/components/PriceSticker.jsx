/**
 * PriceSticker — a round, matte label stuck on a cover's corner, the way a
 * used bookstore prices a book: one colour per shelf (theme STICKER) —
 * Reading, On reader, Read, Want to read, Abandoned.
 *
 * Unread wears NONE (Chef, 2026-09-30): every book not read, on the reader
 * or being read is Unread — 371 of 554 — so the sticker-less cover is the
 * default and a sticker means "this one has a story".
 *
 * Round, matte, NEVER tilted, never neon — GameGeek owns tilted stickers.
 * A fill with dark ink on it (theme STICKER; usedBookstoreContrast). Text is
 * ≥12px. Decorative (aria-hidden): the shelf is already in the card's
 * caption and button label.
 */
import React from "react";
import { Box } from "@mui/material";
import { STICKER } from "../theme/theme";

/**
 * The words on each shelf's sticker. "Abandoned" doesn't fit a price tag at
 * a legible size, so it reads "Gave up" — the card's caption still says
 * Abandoned.
 */
const LINES = {
  reading: ["Reading"],
  "on-reader": ["On", "reader"],
  read: ["Read"],
  "want-to-read": ["Want", "to read"],
  abandoned: ["Gave", "up"],
};

/** What sticker, if any, a book wears: every built-in shelf but Unread. Pure, so it is tested alone. */
export function stickerFor(book) {
  const lines = book ? LINES[book.shelf] : null;
  return lines ? { tone: book.shelf, lines } : null;
}

export default function PriceSticker({ book, size = 64, sx }) {
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
      {/* The words are drawn, not written (content: attr): the card's caption
          already says the shelf, and a second copy in the DOM would be read
          twice and trip every getByText. */}
      <Box component="span" data-label={s.lines.join("\n")} sx={{ whiteSpace: "pre", "&::before": { content: "attr(data-label)" } }} />
    </Box>
  );
}
