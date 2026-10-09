/**
 * DetailHero — the book on the shelf, then title, authors and one meta line
 * (MOBILE_UI_PLAN.md §3.2).
 *
 * Used Bookstore (2026-09-30): the book you picked up stands face-out on a
 * plank of shelf wood, wearing the same price sticker and shelf talker it has
 * in the grid. (It used to sit on a blurred copy of its own cover — the
 * Midnight Reader flourish.) The ✎ "Edit cover" affordance lives in the More
 * sheet; nothing on the cover is tap-only-if-you-know.
 */
import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Close as CloseIcon } from "@mui/icons-material";
import { API_BASE, getCoverUrl } from "../../utils/bookDisplay";
import BookCover from "../../components/BookCover";
import PriceSticker from "../../components/PriceSticker";
import ShelfPlank from "../../components/ShelfPlank";
import ShelfTalker from "../../components/ShelfTalker";
import { bookId, publishedYear, shelfColor, shelfLabel, starsFor } from "./bookFacts";

export default function DetailHero({ book, shelves, onClose, showClose = false }) {
  const theme = useTheme();
  const id = bookId(book);
  const coverUrl = id ? getCoverUrl(book) || `${API_BASE}/books/${id}/cover` : null;

  const authors = Array.isArray(book.authors) ? book.authors.filter(Boolean) : [];
  const stars = starsFor(book.rating);
  const year = publishedYear(book.publishedDate);
  const shelfName = shelfLabel(shelves, book.shelf);
  // The same bookmark the library card carries (BookCard): in progress, or on
  // the Reading shelf before the first page is logged.
  const progress = Number.isFinite(book.readingProgress) ? book.readingProgress : 0;
  const bookmarked = (progress > 0 && progress < 100) || (book.shelf === "reading" && progress < 100);

  const metaParts = [
    stars ? { key: "rating", node: stars } : null,
    book.pageCount > 0 ? { key: "pages", node: `${book.pageCount} pp` } : null,
    year ? { key: "year", node: year } : null,
  ].filter(Boolean);

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.paper",
        px: 2,
        // The full-snap sheet starts at the very top of the screen, so the
        // hero carries the top safe-area inset in standalone mode.
        pt: { xs: "calc(24px + env(safe-area-inset-top))", md: 28 },
        pb: 2.5,
        textAlign: "center",
      }}
    >
      {/* The shop wall behind the shelf: a faint lamp pool, nothing more. */}
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(70% 60% at 50% 30%, ${alpha(theme.palette.progress.main, theme.palette.mode === "dark" ? 0.1 : 0.06)}, transparent 70%)`,
        }}
      />
      {showClose ? (
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{
            position: "absolute",
            top: "calc(4px + env(safe-area-inset-top))",
            right: 4,
            color: "text.primary",
            bgcolor: alpha(theme.palette.background.paper, 0.7),
            "&:hover": { bgcolor: alpha(theme.palette.background.paper, 0.9) },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      ) : null}

      <Box sx={{ position: "relative" }}>
        <Box
          sx={{
            position: "relative",
            width: { xs: 160, md: 200 },
            mx: "auto",
            // Standing face-out on the shelf: a short shadow onto the plank.
            "& [data-testid='book-cover']": { boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), 0 3px 5px rgba(20, 12, 4, 0.4)" },
          }}
        >
          <BookCover
            book={book}
            src={coverUrl}
            size="hero"
            alt={book.title || "Book cover"}
            loading="eager"
            ribbon={bookmarked}
            ribbonTestId="detail-cover-ribbon"
          />
          <PriceSticker book={book} scale={1.1} />
          <ShelfTalker book={book} sx={{ fontSize: "1.25rem" }} />
        </Box>
        {/* The shelf runs the width of the hero. */}
        <ShelfPlank bleed={16} sx={{ height: 14 }} />

        <Typography
          variant="h2"
          component="h2"
          sx={{
            mt: 2,
            fontSize: { xs: 24, md: 26 },
            lineHeight: 1.2,
            color: "text.primary",
            textWrap: "balance",
          }}
        >
          {book.title || "Untitled"}
        </Typography>

        {authors.length > 0 ? (
          <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, color: "primary.main" }}>
            {authors.join(", ")}
          </Typography>
        ) : null}

        {shelfName || metaParts.length > 0 ? (
          <Typography
            variant="caption"
            component="p"
            sx={{ mt: 1, color: "text.muted", display: "block" }}
          >
            {shelfName ? (
              <Box component="span" sx={{ color: shelfColor(theme, book.shelf), fontWeight: 500 }}>
                {shelfName}
              </Box>
            ) : null}
            {metaParts.map((part, index) => (
              <React.Fragment key={part.key}>
                {shelfName || index > 0 ? " · " : null}
                <Box component="span">{part.node}</Box>
              </React.Fragment>
            ))}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
