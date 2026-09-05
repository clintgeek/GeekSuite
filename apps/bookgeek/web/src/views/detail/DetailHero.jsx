/**
 * DetailHero — the cover on a blurred copy of itself, then title, authors and
 * one meta line (MOBILE_UI_PLAN.md §3.2).
 *
 * The blur is the app's one flourish, so it is guarded: under
 * `prefers-reduced-motion: reduce` the layer disappears and the hero is a flat
 * `background.paper` panel. The ✎ "Edit cover" affordance moved into the More
 * sheet; nothing on the cover is tap-only-if-you-know.
 */
import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Close as CloseIcon } from "@mui/icons-material";
import { API_BASE, getCoverUrl } from "../../utils/bookDisplay";
import { bookId, publishedYear, shelfColor, shelfLabel, starsFor } from "./bookFacts";

export default function DetailHero({ book, shelves, onClose, showClose = false }) {
  const theme = useTheme();
  const id = bookId(book);
  const coverUrl = id ? getCoverUrl(book) || `${API_BASE}/books/${id}/cover` : null;

  const authors = Array.isArray(book.authors) ? book.authors.filter(Boolean) : [];
  const stars = starsFor(book.rating);
  const year = publishedYear(book.publishedDate);
  const shelfName = shelfLabel(shelves, book.shelf);

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
      {coverUrl ? (
        <Box
          aria-hidden="true"
          component="img"
          src={coverUrl}
          alt=""
          sx={{
            position: "absolute",
            inset: -24,
            width: "calc(100% + 48px)",
            height: "calc(100% + 48px)",
            objectFit: "cover",
            filter: "blur(28px) saturate(1.2)",
            opacity: 0.62,
            "@media (prefers-reduced-motion: reduce)": { display: "none" },
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, ${alpha(
            theme.palette.background.paper,
            0.12
          )} 0%, ${alpha(theme.palette.background.paper, 0.55)} 62%, ${
            theme.palette.background.paper
          } 100%)`,
          "@media (prefers-reduced-motion: reduce)": {
            background: theme.palette.background.paper,
          },
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
            width: { xs: 160, md: 200 },
            mx: "auto",
            aspectRatio: "2 / 3",
            borderRadius: 1.5,
            overflow: "hidden",
            bgcolor: "background.default",
            border: (t) => `1px solid ${t.palette.divider}`,
            boxShadow: 6,
          }}
        >
          {coverUrl ? (
            <Box
              component="img"
              src={coverUrl}
              alt={book.title || "Book cover"}
              sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : null}
        </Box>

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
