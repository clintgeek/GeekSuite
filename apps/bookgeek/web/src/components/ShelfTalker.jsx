/**
 * ShelfTalker — the hand-lettered card a bookseller clips to the shelf under
 * a book they want you to notice. The ONLY handwriting in BookGeek (Caveat),
 * on an index card with a red rule across the top.
 *
 * One talker per book at most, and only when there is something to say
 * (`talkerFor`): a book you're partway through, or a five-star book. The
 * words repeat what the card already says in its caption (the percentage,
 * the stars), so the talker is decorative (aria-hidden) and the caption stays
 * the source of truth.
 */
import React from "react";
import { Box } from "@mui/material";
import { HAND_FONT, TALKER } from "../theme/theme";

/** What the talker says, if anything. Pure, so it is tested alone. */
export function talkerFor(book) {
  if (!book) return null;
  const p = Number.isFinite(book.readingProgress) ? book.readingProgress : 0;
  if (p > 0 && p < 100) return `${Math.round(p)}% in — no spoilers!`;
  if (book.rating === 5) return "Staff pick!";
  return null;
}

/** A stable small lean for a card, so the same book always hangs the same way. */
function leanFor(text = "") {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return ((((h % 5) + 5) % 5) - 2) * 0.75; // -1.5° … 1.5°
}

export default function ShelfTalker({ book, sx }) {
  const text = talkerFor(book);
  if (!text) return null;
  const key = String(book.id || book._id || book.title || "");
  return (
    <Box
      aria-hidden="true"
      data-testid="shelf-talker"
      sx={{
        position: "absolute",
        right: 4,
        bottom: -4,
        zIndex: 3,
        maxWidth: "78%",
        px: 1,
        pt: "7px",
        pb: "3px",
        bgcolor: TALKER.card,
        color: TALKER.ink,
        borderRadius: "2px",
        transform: `rotate(${leanFor(key)}deg)`,
        transformOrigin: "top center",
        boxShadow: "0 2px 4px rgba(20, 12, 4, 0.35)",
        // The index card's red header rule and one faint blue line.
        backgroundImage: `linear-gradient(180deg, transparent 0 3px, ${TALKER.rule} 3px 4px, transparent 4px), linear-gradient(180deg, transparent 0 calc(100% - 6px), ${TALKER.line} calc(100% - 6px) calc(100% - 5px), transparent calc(100% - 5px))`,
        fontFamily: HAND_FONT,
        fontWeight: 600,
        fontSize: "1.0625rem",
        lineHeight: 1,
        textAlign: "center",
        pointerEvents: "none",
        ...sx,
      }}
    >
      {text}
    </Box>
  );
}
