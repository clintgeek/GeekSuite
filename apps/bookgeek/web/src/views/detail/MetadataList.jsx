/**
 * MetadataList — the two-column definition list, tags and review.
 *
 * Only rows with a value render; an empty book shows nothing rather than a
 * column of em-dashes. `dt`/`dd` pairs are wrapped in `div`s (valid inside a
 * `dl`) so CSS grid can lay them out two-up.
 *
 * Tags (DOCS/TAGS.md §5): the canonical tags and the reader's own ("My
 * tags") as chips; the raw tags exactly as imported sit behind a quiet
 * "Source tags" disclosure, so a catalogue heading never crowds the page but
 * nothing is hidden for good.
 */
import React, { useId, useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { GeekChip } from "@geeksuite/ui";
import { bookTagGroups } from "../../utils/tagGroups";
import { formatBytes, formatCalendarDate, formatDate, formatReadingDate } from "./bookFacts";
import LastReadRow from "./LastReadRow";

/** Marks the row LastReadRow draws (editable, and present even when empty). */
const LAST_READ = Symbol("lastRead");

const captionSx = {
  display: "block",
  color: "text.muted",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

function ChipRow({ label, tags }) {
  if (!tags.length) return null;
  return (
    <Box component="section" aria-label={label} sx={{ mt: 1.5 }}>
      <Typography variant="caption" component="h4" sx={{ ...captionSx, mb: 0.75 }}>
        {label}
      </Typography>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexWrap: "wrap", gap: 1 }}>
        {tags.map((tag) => (
          <Box component="li" key={tag}>
            <GeekChip label={tag} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** The raw import tags, folded: a disclosure row, then a plain comma list. */
function SourceTags({ tags }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!tags.length) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? "true" : "false"}
        aria-controls={listId}
        sx={{
          ...captionSx,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          minHeight: 44,
          px: 0.5,
          ml: -0.5,
          borderRadius: "8px",
          color: "text.secondary",
          "&:hover": { color: "text.primary" },
          "&.Mui-focusVisible": { outline: 2, outlineColor: "primary.main", outlineStyle: "solid" },
        }}
      >
        Source tags
        <Box component="span" sx={{ letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
          {tags.length}
        </Box>
        <ExpandMoreIcon aria-hidden="true" sx={{ fontSize: 18, transition: "transform 150ms", transform: open ? "rotate(180deg)" : "none" }} />
      </ButtonBase>
      <Box id={listId} hidden={!open}>
        {open ? (
          <>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>
              As imported from Calibre and metadata lookups. The tags above come from these.
            </Typography>
            <Typography variant="body2" component="p" sx={{ m: 0, color: "text.primary", overflowWrap: "anywhere" }}>
              {tags.join(" · ")}
            </Typography>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

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

/**
 * `lastRead` — `{ editing, saving, error, onEdit, onCancel, onSave }` from
 * useBookDetail — makes "Last read" an editable row that shows even when
 * empty. Without it the row is read-only and, like the rest, only shows
 * with a value.
 */
export default function MetadataList({ book, lastRead = null }) {
  const primaryFile = Array.isArray(book.files) ? book.files[0] : null;
  const formatLabel = primaryFile
    ? [String(primaryFile.format || "").toUpperCase() || "File", primaryFile.size ? formatBytes(primaryFile.size) : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  const rows = [
    ["Publisher", book.publisher || null],
    // A calendar day stored at UTC midnight, not an instant — read in UTC
    // or it renders a day early west of UTC. `Added` below is a genuine
    // instant and stays local; `Last read` (`dateFinished`) goes through
    // formatReadingDate, which tells the two apart.
    ["Published", formatCalendarDate(book.publishedDate)],
    ["ISBN", book.isbn || null],
    ["ISBN13", book.isbn13 || null],
    ["Language", book.language || null],
    ["Goodreads", book.goodreadsId || null],
    ["Added", formatDate(book.dateAdded)],
    // "Last read" IS `dateFinished` (Chef, 2026-10-08): a re-read moves it on.
    ["Last read", lastRead ? LAST_READ : formatReadingDate(book.dateFinished)],
    [
      "Read count",
      typeof book.readCount === "number" && book.readCount > 0 ? String(book.readCount) : null,
    ],
    ["Format", formatLabel],
  ].filter(([, value]) => Boolean(value));

  const tagGroups = bookTagGroups(book);
  const anyTags = tagGroups.mine.length + tagGroups.canonical.length + tagGroups.source.length > 0;

  if (rows.length === 0 && !anyTags && !book.review) return null;

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
          {rows.map(([label, value]) =>
            value === LAST_READ ? (
              <LastReadRow key={label} book={book} {...lastRead} />
            ) : (
              <DetailRow key={label} label={label} value={value} />
            )
          )}
        </Box>
      ) : null}

      {anyTags ? (
        <Box sx={{ mt: rows.length > 0 ? 1 : 0 }}>
          <ChipRow label="Tags" tags={tagGroups.canonical} />
          <ChipRow label="My tags" tags={tagGroups.mine} />
          <SourceTags tags={tagGroups.source} />
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
