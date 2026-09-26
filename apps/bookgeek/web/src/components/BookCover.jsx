/**
 * BookCover — every cover BookGeek draws: the library card, the list row and
 * the detail hero.
 *
 * The material identity is paper, cloth and a bit of craft ("Midnight
 * Reader", DOCS/CONTEXT.md → Visual identity). A cover is a book, not an app
 * tile, so:
 *
 * - Corners are square (2px), the way a board cover is cut.
 * - A faint spine crease shades the left edge where the cover hinges. It is a
 *   translucent overlay, so real Calibre art keeps its colours; it only
 *   darkens the first few percent of the width.
 * - A book with no art (the cover request 404s, or no id yet) shows a
 *   cloth-bound board instead of a blank box: a muted cloth picked
 *   deterministically from the book, a linen weave in CSS, one thin gold rule,
 *   the title in the display serif and the author in small caps. The cloth is
 *   always the cover's ground, so a loading cover reads as a closed book
 *   rather than a hole.
 * - A book in progress carries a bookmark ribbon hanging from the top edge,
 *   replacing the old amber bar on the bottom edge (which read as a loading
 *   bar). The exact percentage stays in the card's caption as text.
 *
 * Everything drawn here is decorative (aria-hidden, pointer-events none). The
 * title and author already live in the card's own text and button label.
 */
import React, { useState } from "react";
import { Box } from "@mui/material";

// Bookcloth, not app colours: dark, slightly greyed buckram tones. Each one
// was measured with the linen's lightest thread over it (7% white): the cream
// title clears 7:1 and the gold small-caps author clears 5:1 on every cloth.
const CLOTHS = [
  "#5b2328", // oxblood
  "#22402f", // bottle green
  "#2a3552", // library navy
  "#34424f", // slate
  "#4b3423", // tobacco
  "#3f2743", // plum
  "#1f4146", // teal
  "#3e3d24", // olive
];
const CLOTH_INK = "#f4ecdb"; // cream, the title
const CLOTH_GOLD = "#dcc796"; // pale gold, the author
const GOLD_RULE = "#c8a862"; // the stamped rule

/** A stable cloth for a book: the same book is always bound the same way. */
function clothFor(book) {
  const key = String(book?.id || book?._id || book?.title || "");
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CLOTHS[(h >>> 0) % CLOTHS.length];
}

// Linen: fine horizontal and vertical threads, plus a faint fibre noise
// (an inline SVG turbulence — no image asset). All at low alpha so the cloth
// colour does the talking.
const LINEN_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.7 0.12' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const LINEN = [
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 2px)",
  "repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px)",
  LINEN_NOISE,
  // A little light falling across the board, top left.
  "radial-gradient(120% 80% at 20% 10%, rgba(255,255,255,0.06), transparent 60%)",
].join(", ");

// The hinge: a soft shadow at the very edge, a thin crease a few percent in,
// and a hair of light just past it where the board lifts.
const SPINE =
  "linear-gradient(to right," +
  " rgba(0,0,0,0.20) 0%," +
  " rgba(0,0,0,0.06) 2.5%," +
  " rgba(255,255,255,0.05) 4%," +
  " rgba(0,0,0,0.12) 5.2%," +
  " rgba(255,255,255,0.04) 6.6%," +
  " rgba(255,255,255,0) 10%)";

const SIZES = {
  row: { radius: "1.5px", ribbon: null, text: false },
  card: { radius: "2px", ribbon: { width: 10, height: 32, notch: 5, right: "12%" }, text: true },
  hero: { radius: "2px", ribbon: { width: 12, height: 42, notch: 6, right: "12%" }, text: true },
};

function ClothBoard({ book, showText }) {
  const title = book?.title || "Untitled";
  const author = Array.isArray(book?.authors) ? book.authors.filter(Boolean)[0] : null;
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "absolute",
        inset: 0,
        backgroundImage: LINEN,
        // Blind-stamped frame: a debossed line inset from the edge.
        "&::after": {
          content: '""',
          position: "absolute",
          inset: "6%",
          left: "11%",
          border: "1px solid rgba(0,0,0,0.20)",
          boxShadow: "1px 1px 0 rgba(255,255,255,0.05)",
          borderRadius: "1px",
          pointerEvents: "none",
        },
      }}
    >
      {showText ? (
        <Box
          sx={{
            position: "absolute",
            left: "17%",
            right: "11%",
            top: "24%",
            textAlign: "center",
            containerType: "inline-size",
          }}
        >
          <Box
            component="span"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontFamily: '"DM Serif Display", serif',
              fontWeight: 400,
              fontSize: "clamp(13px, 13cqi, 24px)",
              lineHeight: 1.15,
              color: CLOTH_INK,
              textWrap: "balance",
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </Box>
          <Box
            sx={{
              width: "34%",
              height: "1px",
              mx: "auto",
              my: "clamp(6px, 7cqi, 12px)",
              bgcolor: GOLD_RULE,
            }}
          />
          {author ? (
            <Box
              component="span"
              sx={{
                display: "block",
                fontFamily: '"Inter", system-ui, sans-serif',
                fontVariantCaps: "all-small-caps",
                letterSpacing: "0.08em",
                fontWeight: 500,
                fontSize: "clamp(12px, 9cqi, 16px)",
                lineHeight: 1.2,
                color: CLOTH_GOLD,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {author}
            </Box>
          ) : null}
        </Box>
      ) : (
        // Too small for words (the 40px list row): just the gold rule.
        <Box
          sx={{
            position: "absolute",
            left: "24%",
            right: "18%",
            top: "38%",
            height: "1px",
            bgcolor: GOLD_RULE,
            opacity: 0.85,
          }}
        />
      )}
    </Box>
  );
}

function Ribbon({ spec, testId }) {
  return (
    <Box
      aria-hidden="true"
      data-testid={testId}
      sx={{
        position: "absolute",
        top: 0,
        right: spec.right,
        width: spec.width,
        height: spec.height,
        zIndex: 2,
        pointerEvents: "none",
        // A soft fall shadow, not a hard offset: the silk lies on the board.
        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          clipPath: `polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - ${spec.notch}px), 0 100%)`,
          // Grosgrain silk in the app's one amber (palette.progress), with a
          // centre sheen and a darker fold where it leaves the top edge.
          background: (t) =>
            `linear-gradient(to bottom, rgba(0,0,0,0.28) 0, rgba(0,0,0,0) 5px),` +
            ` linear-gradient(to right, rgba(0,0,0,0.18), rgba(255,255,255,0.12) 45%, rgba(0,0,0,0.12)),` +
            ` ${t.palette.progress?.ribbon ?? t.palette.progress?.main ?? "#b45309"}`,
        }}
      />
    </Box>
  );
}

export default function BookCover({
  book,
  src,
  size = "card",
  ribbon = false,
  alt = "",
  loading = "lazy",
  ribbonTestId,
  sx,
}) {
  const spec = SIZES[size] || SIZES.card;
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = !src || failedSrc === src;

  return (
    <Box
      data-testid="book-cover"
      sx={{
        position: "relative",
        aspectRatio: "2 / 3",
        width: "100%",
        borderRadius: spec.radius,
        overflow: "hidden",
        bgcolor: clothFor(book),
        // A hairline so the board's edge holds against a surface its own
        // colour, and a faint shadow under it; nothing that reads as a sticker.
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
        ...sx,
      }}
    >
      <ClothBoard book={book} showText={failed && spec.text} />
      {!failed ? (
        <Box
          component="img"
          src={src}
          alt={alt}
          loading={loading}
          onError={() => setFailedSrc(src)}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : null}
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          backgroundImage: SPINE,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.14)",
          borderRadius: "inherit",
        }}
      />
      {ribbon && spec.ribbon ? <Ribbon spec={spec.ribbon} testId={ribbonTestId} /> : null}
    </Box>
  );
}
