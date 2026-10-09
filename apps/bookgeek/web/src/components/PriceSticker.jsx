/**
 * PriceSticker — a sunburst shop label stuck on a cover's corner, the way a
 * used bookstore prices a book: one colour per shelf (theme STICKER) —
 * Reading, On reader, Read, Want to read, Abandoned.
 *
 * Unread wears NONE (Chef, 2026-09-30): every book not read, on the reader
 * or being read is Unread — 371 of 554 — so the sticker-less cover is the
 * default and a sticker means "this one has a story".
 *
 * 2026-10-08 (Chef): smaller, more sticker-like, and stuck on by hand — a
 * shallow starburst edge with faint sunrays in the paper, and each book's
 * sticker sits at its own slight tilt and offset. That placement is SEEDED
 * from the book's id (`stickerPlacement`), never Math.random: it must not
 * jump on a re-render, and the same book wears the same sticker in the grid
 * and on its page. Still matte and paper-toned — GameGeek's arcade stickers
 * are the loud, neon ones; these are a shop's price labels.
 *
 * The rays are LIGHTER than the ground, so the dark ink only gains contrast
 * (theme STICKER; usedBookstoreContrast). Text stays ≥ 12px. Decorative
 * (aria-hidden): the shelf is already in the card's caption and button label.
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

/** Largest tilt either way, in degrees, and the corner nudge range, in px. */
const MAX_TILT = 8;
const TOP_RANGE = [3, 11];
const LEFT_RANGE = [4, 14];

/** FNV-1a over the id: small, fast, and the same answer every time. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Where this book's sticker was stuck: a tilt and a nudge from the corner,
 * derived from the book's id so it never changes. Pure, so it is tested alone.
 * A book with no id gets the plain corner, untilted.
 */
export function stickerPlacement(book) {
  const id = book?.id || book?._id;
  if (!id) return { rotate: 0, top: TOP_RANGE[0] + 3, left: LEFT_RANGE[0] + 4 };
  const h = hash(String(id));
  const unit = (shift) => ((h >>> shift) & 0xff) / 255; // three independent bytes
  const span = (range, u) => Math.round(range[0] + (range[1] - range[0]) * u);
  return {
    rotate: Math.round((unit(0) * 2 - 1) * MAX_TILT * 10) / 10,
    top: span(TOP_RANGE, unit(8)),
    left: span(LEFT_RANGE, unit(16)),
  };
}

/** A shallow 28-point starburst, as a clip-path: points at 50%, valleys at 46%. */
const POINTS = 28;
const STARBURST = `polygon(${Array.from({ length: POINTS * 2 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 46;
  const a = (Math.PI * i) / POINTS - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`;
}).join(", ")})`;

export default function PriceSticker({ book, size = 58, sx }) {
  const s = stickerFor(book);
  if (!s) return null;
  const tone = STICKER[s.tone];
  const at = stickerPlacement(book);
  return (
    <Box
      aria-hidden="true"
      data-testid="price-sticker"
      data-tone={s.tone}
      sx={{
        position: "absolute",
        top: at.top,
        left: at.left,
        zIndex: 2,
        width: size,
        height: size,
        transform: `rotate(${ at.rotate }deg)`,
        // The clip-path below would cut a box-shadow off, so the lift is a
        // drop-shadow on the wrapper: it follows the starburst's edge.
        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
        pointerEvents: "none",
        ...sx,
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          clipPath: STARBURST,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
          color: tone.ink,
          // Paper, sunrays a shade lighter, and a printed rim ring inside the edge.
          background: [
            `radial-gradient(circle, transparent 0 39%, ${ tone.rim } 39.5% 41%, transparent 41.5%)`,
            "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.22) 0deg 6deg, transparent 6deg 12deg)",
            tone.ground,
          ].join(", "),
          fontWeight: 800,
          fontSize: "0.75rem",
          lineHeight: 1,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
        }}
      >
        {/* The words are drawn, not written (content: attr): the card's caption
            already says the shelf, and a second copy in the DOM would be read
            twice and trip every getByText. */}
        {/* Condensed like a price-gun label: full 12px height, 85% width, so
            "READING" and "WANT / TO READ" sit inside the starburst's points. */}
        <Box
          component="span"
          data-label={s.lines.join("\n")}
          sx={{ display: "block", whiteSpace: "pre", transform: "scaleX(0.85)", "&::before": { content: "attr(data-label)" } }}
        />
      </Box>
    </Box>
  );
}
