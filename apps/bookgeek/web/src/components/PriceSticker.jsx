/**
 * PriceSticker — a shop sticker slapped on a cover's corner, the way a used
 * bookstore labels a book: one colour per shelf (theme STICKER) — Reading,
 * On reader, Read, Want to read, Abandoned.
 *
 * Unread wears NONE (Chef, 2026-09-30): every book not read, on the reader
 * or being read is Unread — 371 of 554 — so the sticker-less cover is the
 * default and a sticker means "this one has a story".
 *
 * 2026-10-09 (Chef, from a photo of real bookshop stickers): not one stamp
 * repeated, but a MIX — round promo dots, printed price labels with a header
 * band and barcode, small hand-priced tags with a curled corner, and solid
 * block labels — each stuck on at its own angle and spot. Shape, tilt, corner
 * and offset are all SEEDED from the book's id (`stickerPlacement`), never
 * Math.random: a book's sticker never jumps on a re-render, and it is the same
 * sticker in the grid and on the book's page.
 *
 * Tilt rule (Chef, 2026-10-08): no tilted buttons or UI in BookGeek; stickers
 * on books tilt, for realism. Grounds are the shelf's pastel or cream paper,
 * always with dark ink, so contrast never depends on the cover underneath.
 * Text stays ≥ 12px. Decorative (aria-hidden): the shelf is already in the
 * card's caption and button label. The hand-priced tag borrows the shelf
 * talker's Caveat — a price written in marker is the one other handwriting a
 * shop puts on a book.
 */
import React from "react";
import { Box } from "@mui/material";
import { STICKER, HAND_FONT } from "../theme/theme";

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

/** The sticker shapes, as a real shop mixes them. */
export const SHAPES = Object.freeze(["dot", "label", "tag", "block"]);

/** Largest tilt either way, in degrees, and how far from the corner it lands, in px. */
const MAX_TILT = 12;
const TOP_RANGE = [4, 30];
const SIDE_RANGE = [4, 18];

/**
 * FNV-1a over the id, then a murmur finalizer: FNV alone barely stirs its
 * high bytes, so ids that differ only in the last character ("book-1",
 * "book-2") landed in the same spot. Small, fast, the same answer every time.
 */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * How this book's sticker was stuck on: its shape, which top corner, a tilt
 * and a nudge — all derived from the book's id so they never change. A book
 * with a bookmark ribbon (any reading progress) keeps its sticker on the left,
 * clear of the ribbon. Pure, so it is tested alone. No id → a plain dot,
 * square in the top-left corner.
 */
export function stickerPlacement(book) {
  const id = book?.id || book?._id;
  if (!id) return { shape: "dot", side: "left", rotate: 0, top: 8, offset: 8 };
  const h = hash(String(id));
  const h2 = hash(`${id}:sticker`);
  const unit = (n, shift) => ((n >>> shift) & 0xff) / 255; // independent bytes
  const span = (range, u) => Math.round(range[0] + (range[1] - range[0]) * u);
  const hasRibbon = Number(book?.readingProgress) > 0 && Number(book?.readingProgress) < 100;
  return {
    shape: SHAPES[h2 % SHAPES.length],
    side: hasRibbon || unit(h2, 8) < 0.5 ? "left" : "right",
    rotate: Math.round((unit(h, 0) * 2 - 1) * MAX_TILT * 10) / 10,
    top: span(TOP_RANGE, unit(h, 8)),
    offset: span(SIDE_RANGE, unit(h, 16)),
  };
}

const PAPER = "#FFFDF6";
const lift = "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))";

/** The words, drawn rather than written (see the note in PriceSticker). */
function Words({ lines, sx }) {
  return (
    <Box
      component="span"
      data-label={lines.join("\n")}
      sx={{ display: "block", whiteSpace: "pre", "&::before": { content: "attr(data-label)" }, ...sx }}
    />
  );
}

/** A curled-up corner, the way a label lifts where it was peeled and pressed. */
const curl = (corner) => ({
  "&::after": {
    content: '""',
    position: "absolute",
    width: 9,
    height: 9,
    [corner === "br" ? "right" : "left"]: 0,
    bottom: 0,
    background:
      corner === "br"
        ? "linear-gradient(315deg, transparent 50%, rgba(0,0,0,0.18) 50%, #e9e4d6 60%)"
        : "linear-gradient(45deg, transparent 50%, rgba(0,0,0,0.18) 50%, #e9e4d6 60%)",
  },
});

function Face({ shape, tone, lines, scale }) {
  const px = (n) => Math.round(n * scale);
  const word = { fontWeight: 800, fontSize: "0.75rem", lineHeight: 1, textTransform: "uppercase" };
  if (shape === "dot") {
    return (
      <Box
        sx={{
          width: px(52), height: px(52), borderRadius: "50%",
          display: "grid", placeContent: "center", textAlign: "center",
          bgcolor: tone.ground, color: tone.ink,
          boxShadow: `inset 0 0 0 3px ${tone.ground}, inset 0 0 0 4px ${tone.rim}`,
        }}
      >
        <Words lines={lines} sx={{ ...word, transform: "scaleX(0.88)" }} />
      </Box>
    );
  }
  if (shape === "label") {
    // A printed price label: shelf colour band on top, a barcode on paper below.
    return (
      <Box sx={{ position: "relative", width: px(66), bgcolor: PAPER, color: tone.ink, borderRadius: "3px", overflow: "hidden", boxShadow: `inset 0 0 0 1px ${tone.rim}`, ...curl("bl") }}>
        <Box sx={{ bgcolor: tone.ground, px: "4px", py: "3px", textAlign: "center" }}>
          <Words lines={lines} sx={{ ...word, transform: "scaleX(0.85)" }} />
        </Box>
        <Box
          aria-hidden="true"
          sx={{
            height: px(14), mx: "6px", my: "4px",
            background: `repeating-linear-gradient(90deg, ${tone.ink} 0 1px, transparent 1px 3px, ${tone.ink} 3px 5px, transparent 5px 6px, ${tone.ink} 6px 7px, transparent 7px 9px)`,
            opacity: 0.85,
          }}
        />
      </Box>
    );
  }
  if (shape === "tag") {
    // A small hand-priced tag: a coloured edge, a band, the shelf in marker.
    return (
      <Box
        sx={{
          position: "relative", width: px(58), bgcolor: PAPER, color: "#1F2A44",
          border: `3px solid ${tone.ground}`, borderRadius: "2px", ...curl("br"),
        }}
      >
        <Box sx={{ height: px(9), bgcolor: tone.ground }} />
        <Words
          lines={lines}
          sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: "1rem", lineHeight: 0.95, textAlign: "center", py: "4px" }}
        />
      </Box>
    );
  }
  // "block": a solid shelf-colour label with a paper window.
  return (
    <Box sx={{ width: px(60), bgcolor: tone.ground, color: tone.ink, borderRadius: "3px", p: "4px" }}>
      <Box sx={{ bgcolor: PAPER, borderRadius: "2px", py: "6px", textAlign: "center" }}>
        <Words lines={lines} sx={{ ...word, fontSize: "0.8125rem", transform: "scaleX(0.85)" }} />
      </Box>
    </Box>
  );
}

export default function PriceSticker({ book, scale = 1, sx }) {
  const s = stickerFor(book);
  if (!s) return null;
  const tone = STICKER[s.tone];
  const at = stickerPlacement(book);
  return (
    <Box
      aria-hidden="true"
      data-testid="price-sticker"
      data-tone={s.tone}
      data-shape={at.shape}
      sx={{
        position: "absolute",
        top: at.top,
        [at.side]: at.offset,
        zIndex: 2,
        transform: `rotate(${ at.rotate }deg)`,
        filter: lift,
        pointerEvents: "none",
        ...sx,
      }}
    >
      {/* The words are drawn, not written (content: attr): the card's caption
          already says the shelf, and a second copy in the DOM would be read
          twice and trip every getByText. */}
      <Face shape={at.shape} tone={tone} lines={s.lines} scale={scale} />
    </Box>
  );
}
