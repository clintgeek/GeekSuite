/**
 * MetadataList — the two-column definition list, tags and review.
 *
 * Only rows with a value render; an empty book shows nothing rather than a
 * column of em-dashes. `dt`/`dd` pairs are wrapped in `div`s (valid inside a
 * `dl`) so CSS grid can lay them out two-up.
 */
import React from "react";
import { Box, Typography } from "@mui/material";
import { GeekChip } from "@geeksuite/ui";
import { formatBytes, formatDate } from "./bookFacts";

function DetailRow({ label, value }) {
  return (
    <Box component="div">
      <Typography
        component="dt"
        variant="caption"
        sx={{
          display: "block",
          color: "text.muted",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, color: "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function MetadataList({ book }) {
  const primaryFile = Array.isArray(book.files) ? book.files[0] : null;
  const formatLabel = primaryFile
    ? [String(primaryFile.format || "").toUpperCase() || "File", primaryFile.size ? formatBytes(primaryFile.size) : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  const rows = [
    ["Publisher", book.publisher || null],
    ["Published", formatDate(book.publishedDate)],
    ["ISBN", book.isbn || null],
    ["ISBN13", book.isbn13 || null],
    ["Language", book.language || null],
    ["Goodreads", book.goodreadsId || null],
    ["Added", formatDate(book.dateAdded)],
    ["Finished", formatDate(book.dateFinished)],
    [
      "Read count",
      typeof book.readCount === "number" && book.readCount > 0 ? String(book.readCount) : null,
    ],
    ["Format", formatLabel],
  ].filter(([, value]) => Boolean(value));

  const tags = Array.isArray(book.tags) ? book.tags.filter(Boolean) : [];

  if (rows.length === 0 && tags.length === 0 && !book.review) return null;

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Typography
        variant="caption"
        component="h3"
        sx={{
          display: "block",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: "text.muted",
          mb: 1,
        }}
      >
        Details
      </Typography>

      {rows.length > 0 ? (
        <Box
          component="dl"
          sx={{
            m: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          {rows.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </Box>
      ) : null}

      {tags.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: rows.length > 0 ? 2 : 0 }}>
          {tags.map((tag) => (
            <GeekChip key={tag} label={tag} />
          ))}
        </Box>
      ) : null}

      {book.review ? (
        <Box
          sx={{
            mt: 2,
            pl: 1.5,
            borderLeft: (t) => `2px solid ${t.palette.divider}`,
          }}
        >
          <Typography
            variant="caption"
            component="h4"
            sx={{
              display: "block",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "text.muted",
            }}
          >
            Review
          </Typography>
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", color: "text.primary", fontStyle: "italic" }}
          >
            {book.review}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}
