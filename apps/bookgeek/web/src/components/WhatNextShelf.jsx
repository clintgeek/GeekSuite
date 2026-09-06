/**
 * WhatNextShelf — "what should I read next", above the library grid.
 *
 * AI idea #4 (`DOCS/AI_IDEAS.md`), stream R117. The gateway computes the
 * candidate set (owned or shelved, not finished) and the model only ranks it
 * and writes the one-line reason, so a card here can be a bad *suggestion* but
 * never a book you have already read.
 *
 * Shape: a horizontally scrolling strip in the same grammar as `ShelfStrip` —
 * scroll-snap, edge-to-edge, no scrollbar — carrying real `BookCard`s so a
 * suggestion looks and behaves exactly like the same book in the grid below.
 * `ShelfStrip` itself is a *chip nav*, not a book rail, so it is the pattern
 * that is reused here rather than the component.
 *
 * Every card carries its `why`, the strip header carries one "AI-drafted" chip
 * and one provenance line, and "Start reading" goes through the ordinary shelf
 * mutation in `App.jsx` — nothing on this strip writes on its own.
 */
import React from "react";
import { Box, Button, Chip, Skeleton, Typography } from "@mui/material";
import { AutoAwesome as SparkleIcon } from "@mui/icons-material";
import BookCard from "./BookCard";
import { whatNextProvenanceLine } from "../utils/libraryAssistant";

/** 150px keeps two and a bit cards on the narrowest phone — a strip, not a grid. */
const CARD_WIDTH = 150;

export default function WhatNextShelf({
  picks,
  provenance,
  loading = false,
  error = null,
  shelves,
  onOpen,
  onStartReading,
  startingBookId = null,
}) {
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  if (!loading && !error && !hasPicks) return null;

  return (
    <Box component="section" aria-labelledby="what-next-heading" sx={{ mb: 2 }}>
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          columnGap: 1,
          rowGap: 0.25,
        }}
      >
        <Typography
          id="what-next-heading"
          component="h2"
          variant="body1"
          sx={{ fontWeight: 600 }}
        >
          What next?
        </Typography>
        <Chip
          icon={<SparkleIcon />}
          label="AI-drafted"
          size="small"
          variant="outlined"
          sx={{ height: 22, "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 } }}
        />
        {whatNextProvenanceLine(provenance) ? (
          <Typography variant="caption" sx={{ color: "text.muted", width: "100%" }}>
            {whatNextProvenanceLine(provenance)}
          </Typography>
        ) : null}
      </Box>

      {error ? (
        <Typography
          role="status"
          variant="caption"
          sx={{ display: "block", px: { xs: 2, md: 3 }, pt: 0.5, color: "error.main" }}
        >
          {error}
        </Typography>
      ) : null}

      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          px: { xs: 2, md: 3 },
          pt: 1,
          pb: 0.5,
          overflowX: "auto",
          scrollSnapType: "x proximity",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ flex: `0 0 ${ CARD_WIDTH }px`, width: CARD_WIDTH }}>
              <Skeleton
                variant="rectangular"
                sx={{ width: "100%", aspectRatio: "2 / 3", borderRadius: "8px" }}
              />
              <Skeleton variant="text" sx={{ mt: 1, width: "85%" }} />
              <Skeleton variant="text" sx={{ width: "60%" }} />
            </Box>
          ))
          : picks.map((pick) => {
            const book = pick.book;
            const bookId = pick.bookId;
            const starting = startingBookId === bookId;
            return (
              <Box
                key={bookId}
                sx={{
                  flex: `0 0 ${ CARD_WIDTH }px`,
                  width: CARD_WIDTH,
                  scrollSnapAlign: "start",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                }}
              >
                <BookCard book={book} shelves={shelves} onOpen={onOpen} />
                {pick.why ? (
                  <Typography
                    variant="caption"
                    component="p"
                    sx={{
                      color: "text.secondary",
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {pick.why}
                  </Typography>
                ) : null}
                <Button
                  size="small"
                  variant="outlined"
                  disabled={starting}
                  onClick={() => onStartReading?.(book)}
                  sx={{ minHeight: 44, mt: "auto" }}
                >
                  {starting ? "Starting…" : "Start reading"}
                </Button>
              </Box>
            );
          })}
      </Box>
    </Box>
  );
}
