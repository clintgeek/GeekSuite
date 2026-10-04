/**
 * WhatNextSheet — "what should I read next", on demand.
 *
 * AI idea #4 (`DOCS/AI_IDEAS.md`), stream R117; UX rework 2026-10-03. It
 * used to be a rail of full-size cards that loaded with the library and
 * stood between you and it. Now nothing is asked until the header's
 * `WhatNextButton` is tapped, and the answer opens in a `GeekSheet`, which is
 * a bottom sheet on a phone and a dialog on desktop. The picks are compact rows: cover, title,
 * author, the whole `why`, and "Start reading".
 *
 * The gateway computes the candidate set (owned or shelved, not finished) and
 * the model only ranks it, so a row here can be a bad *suggestion* but never
 * a book you have already read. "Start reading" goes through the ordinary
 * shelf mutation (hooks/useWhatNext.js) — nothing here writes on its own.
 */
import React, { useEffect, useState } from "react";
import { Box, Button, ButtonBase, IconButton, Skeleton, TextField, Typography, useTheme } from "@mui/material";
import { AutoAwesome as SparkleIcon } from "@mui/icons-material";
import { GeekSheet } from "@geeksuite/ui";
import BookCover from "./BookCover";
import { API_BASE, getCoverUrl } from "../utils/bookDisplay";
import { whatNextProvenanceLine } from "../utils/libraryAssistant";

function PickRow({ pick, onOpen, onStartReading, starting }) {
  const theme = useTheme();
  const book = pick.book;
  const bookId = pick.bookId;
  const title = book.title || "Untitled";
  const authors = Array.isArray(book.authors) && book.authors.length ? book.authors.join(", ") : null;

  return (
    <Box component="li" data-testid="what-next-pick" sx={{ listStyle: "none", borderBottom: 1, borderColor: "divider", py: 1, display: "flex", alignItems: "flex-start", gap: 1.5 }}>
      {/* The cover opens the book too, but the title button below is the one
          a screen reader or keyboard meets — buttons never nest, so "Start
          reading" can sit in the same column. */}
      <ButtonBase onClick={() => onOpen?.(book)} tabIndex={-1} aria-hidden="true" sx={{ flexShrink: 0, borderRadius: "4px", mt: 0.5 }}>
        <BookCover
          book={book}
          src={bookId ? getCoverUrl(book) || `${ API_BASE }/books/${ bookId }/cover` : null}
          size="row"
          sx={{ width: 48 }}
        />
      </ButtonBase>
      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <ButtonBase
          onClick={() => onOpen?.(book)}
          aria-label={title}
          sx={{ width: "100%", display: "block", textAlign: "left", borderRadius: "6px", py: 0.5 }}
        >
          <Typography
            sx={{
              fontFamily: theme.typography.h1.fontFamily,
              fontWeight: 400,
              fontSize: "1.0625rem",
              lineHeight: 1.25,
              color: "text.primary",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </Typography>
          {authors ? (
            <Typography variant="body2" noWrap sx={{ color: "text.secondary" }}>
              {authors}
            </Typography>
          ) : null}
          {pick.why ? (
            <Typography variant="body2" component="p" sx={{ color: "text.secondary", mt: 0.5, lineHeight: 1.4 }}>
              {pick.why}
            </Typography>
          ) : null}
        </ButtonBase>
        {onStartReading ? (
          <Button size="small" disabled={starting} onClick={() => onStartReading(book)} sx={{ minHeight: 44, ml: -1 }}>
            {starting ? "Starting…" : "Start reading"}
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

export default function WhatNextSheet({
  open,
  onClose,
  picks,
  provenance,
  loading = false,
  error = null,
  mood = null,
  onSubmitMood,
  onOpen,
  onStartReading,
  startingBookId = null,
}) {
  const [moodText, setMoodText] = useState(mood || "");
  // Re-opening shows the mood that produced the list underneath it.
  useEffect(() => {
    if (open) setMoodText(mood || "");
  }, [open, mood]);

  const submitMood = (event) => {
    event?.preventDefault?.();
    onSubmitMood?.(moodText);
  };
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  const provenanceLine = whatNextProvenanceLine(provenance);

  return (
    <GeekSheet
      open={Boolean(open)}
      onClose={onClose}
      title="What should I read next?"
      description={(!loading && provenanceLine) || "Suggestions from your library and ratings"}
      bodySx={{ pt: 0 }}
    >
      {onSubmitMood ? (
        <Box component="form" onSubmit={submitMood} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <TextField
            value={moodText}
            onChange={(e) => setMoodText(e.target.value)}
            placeholder="In the mood for… (light, short, sci-fi)"
            size="small"
            fullWidth
            inputProps={{ maxLength: 200, "aria-label": "Mood for suggestions" }}
            sx={{ "& .MuiInputBase-root": { height: 44 } }}
          />
          <Button type="submit" variant="outlined" disabled={loading} sx={{ minHeight: 44, flexShrink: 0 }}>
            Ask
          </Button>
        </Box>
      ) : null}

      {error ? (
        <Typography role="status" variant="body2" sx={{ color: "error.main", py: 1 }}>
          {error}
        </Typography>
      ) : null}

      {loading ? (
        <Box aria-busy="true" aria-label="Finding suggestions">
          {Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Skeleton variant="rectangular" sx={{ width: 48, height: 72, borderRadius: "4px", flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" sx={{ width: "70%" }} />
                <Skeleton variant="text" sx={{ width: "40%" }} />
                <Skeleton variant="text" sx={{ width: "90%" }} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : hasPicks ? (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {picks.map((pick) => (
            <PickRow
              key={pick.bookId}
              pick={pick}
              onOpen={onOpen}
              onStartReading={onStartReading}
              starting={startingBookId === pick.bookId}
            />
          ))}
        </Box>
      ) : !error ? (
        <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
          Nothing to suggest right now — every book here is finished or off the shelves.
        </Typography>
      ) : null}
    </GeekSheet>
  );
}

/**
 * The header control that opens the sheet: a round icon on a phone, where
 * the header row is already full, and a labelled pill on desktop.
 */
export function WhatNextButton({ onClick, isDesktop = false, label = "What should I read next?" }) {
  return isDesktop ? (
    <Button variant="outlined" onClick={onClick} startIcon={<SparkleIcon sx={{ fontSize: 18 }} />} sx={{ minHeight: 44, borderRadius: "999px", px: 2, whiteSpace: "nowrap" }}>
      What next?
    </Button>
  ) : (
    <IconButton onClick={onClick} aria-label={label} sx={{ width: 44, height: 44, border: 1, borderColor: "border", borderRadius: "999px", color: "text.primary" }}>
      <SparkleIcon sx={{ fontSize: 20 }} />
    </IconButton>
  );
}
