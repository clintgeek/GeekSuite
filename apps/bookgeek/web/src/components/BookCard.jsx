/**
 * BookGeek library card — one book in the grid.
 *
 * The Pocket Pass rules (DOCS/MOBILE_UI_PLAN.md §3.1): the whole card is the
 * tap target, a book in progress carries a bookmark ribbon on its cover
 * (BookCover; it replaced the amber bar on the bottom edge in 2026-09) instead
 * of a separate row, and the shelf state is one 12px caption line
 * ("Reading · 42% ✓") instead of a 9px pill. The per-card basket "+" is gone —
 * bulk basket work happens in Select mode, from the filter sheet's overflow.
 *
 * Rateable books (utils/rating.js) show their stars in the shelf line, right
 * after the label: "Read ★★★★☆". (They sat across the bottom of the cover for
 * one release; Chef meant the info block.) That puts the shelf line OUTSIDE the
 * card's button, as its own row under the author: a control inside a <button>
 * is invalid HTML, and every star tap would open the book. The select-mode
 * checkbox sits outside the button for the same reason.
 *
 * Used Bookstore (2026-09-30): no card box any more — the book STANDS on a
 * shelf. The cover sits on a ShelfPlank that bleeds half the grid gap past
 * the card on each side, so a row of cards is one continuous shelf; the
 * title and author are the shelf-edge label under it. The pile you haven't
 * read wears a PriceSticker; a book in progress or a five-star book gets a
 * hand-lettered ShelfTalker. Hover lifts the book off the shelf, not the card.
 */
import React from "react";
import { Box, ButtonBase, Checkbox, Typography, alpha, useTheme } from "@mui/material";
import { Check as CheckIcon } from "@mui/icons-material";
import { API_BASE, getCoverUrl } from "../utils/bookDisplay";
import { canRate } from "../utils/rating";
import StarRating from "./StarRating";
import BookCover from "./BookCover";
import PriceSticker from "./PriceSticker";
import ShelfPlank from "./ShelfPlank";
import ShelfTalker from "./ShelfTalker";

export default function BookCard({
  book,
  shelves,
  selectMode = false,
  selected = false,
  onOpen,
  onToggleSelect,
  onRate,
}) {
  const theme = useTheme();
  const bookId = book.id || book._id;
  const title = book.title || "Untitled";
  const authors =
    Array.isArray(book.authors) && book.authors.length > 0
      ? book.authors.join(", ")
      : "Unknown author";

  const progress = Number.isFinite(book.readingProgress)
    ? Math.min(100, Math.max(0, book.readingProgress))
    : 0;
  // A finished book's "100%" is noise next to its "Read" label; the caption
  // shows the percentage only while a book is in progress.
  const inProgress = progress > 0 && progress < 100;
  // The bookmark ribbon marks a book you are in the middle of: any progress
  // short of the end, or on the Reading shelf before the first page is logged.
  const bookmarked = inProgress || (book.shelf === "reading" && progress < 100);

  const shelf = shelves.find((s) => s.id === book.shelf);
  const shelfLabel = shelf && shelf.id !== "all" ? shelf.label : null;
  const shelfColor =
    theme.palette.shelf?.[book.shelf] ?? theme.palette.shelf?.custom ?? "text.muted";

  const rateable = Boolean(onRate) && !selectMode && canRate(book);

  const handleActivate = () => {
    if (selectMode) {
      onToggleSelect?.(bookId);
      return;
    }
    onOpen?.(book);
  };

  return (
    <Box
      data-testid="book-card"
      sx={{
        position: "relative",
        minWidth: 0,
        "@media (hover: hover)": {
          "&:hover [data-book-standing]": { transform: "translateY(-3px)" },
        },
      }}
    >
      <ButtonBase
        onClick={handleActivate}
        aria-label={title}
        aria-pressed={selectMode ? selected : undefined}
        sx={{
          display: "block",
          width: "100%",
          textAlign: "left",
          p: 0,
          borderRadius: "4px",
          "&.Mui-focusVisible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main", outlineOffset: 3 },
        }}
      >
        {/* The book, standing on the shelf. */}
        <Box
          data-book-standing
          sx={{
            position: "relative",
            px: 0.5,
            transition: theme.transitions.create("transform", { duration: 160 }),
            "& [data-testid='book-cover']": {
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), 0 2px 3px rgba(20, 12, 4, 0.35)",
              ...(selected ? { outline: `3px solid ${ theme.palette.primary.main }`, outlineOffset: 2 } : null),
            },
          }}
        >
          <BookCover
            book={book}
            src={bookId ? getCoverUrl(book) || `${ API_BASE }/books/${ bookId }/cover` : null}
            size="card"
            ribbon={bookmarked}
            ribbonTestId="book-card-ribbon"
          />
          <PriceSticker book={book} />
          <ShelfTalker book={book} />
        </Box>
        <ShelfPlank sx={{ mb: 1 }} />

        <Typography
          variant="body1"
          sx={{
            // The display serif, at its one weight (DM Serif Display ships
            // 400 only; a faked bold smears it). A touch larger than the sans
            // it replaced, since the serif sets small.
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 400,
            fontSize: "1.0625rem",
            color: "text.primary",
            lineHeight: 1.25,
            px: 0.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </Typography>
        <Typography variant="body2" noWrap sx={{ color: "text.secondary", px: 0.5 }}>
          {authors}
        </Typography>
      </ButtonBase>

      {/* The shelf line, as its own row outside the button so the stars can
          live in it. Its text is not a tap target for opening the book — the
          cover, title and author above it are. */}
      {(shelfLabel || inProgress || book.owned || rateable) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 0.75,
            px: 0.5,
            pb: rateable ? 0 : 0.5,
            mt: rateable ? -0.5 : 0,
            minWidth: 0,
          }}
        >
          <Typography
            variant="caption"
            component="p"
            sx={{ color: "text.muted", display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
          >
            {shelfLabel && (
              <Box
                component="span"
                sx={{
                  color: shelfColor,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {shelfLabel}
              </Box>
            )}
            {shelfLabel && inProgress && <Box component="span">·</Box>}
            {inProgress && <Box component="span">{Math.round(progress)}%</Box>}
          </Typography>
          {rateable && (
            <Box sx={{ width: 100, flexShrink: 0 }}>
              <StarRating
                value={book.rating}
                label={title}
                variant="inline"
                onChange={(n) => onRate(book, n)}
              />
            </Box>
          )}
          {book.owned && (
            <CheckIcon titleAccess="Owned" sx={{ fontSize: 14, color: "text.muted" }} />
          )}
        </Box>
      )}

      {selectMode && (
        <Checkbox
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.(bookId)}
          inputProps={{ "aria-label": `Select ${ title }` }}
          sx={{
            position: "absolute",
            top: 4,
            left: 4,
            zIndex: 2,
            width: 44,
            height: 44,
            borderRadius: "8px",
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            "&:hover": { bgcolor: alpha(theme.palette.background.paper, 0.95) },
          }}
        />
      )}
    </Box>
  );
}
