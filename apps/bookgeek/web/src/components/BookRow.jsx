/**
 * BookRow — one book in the list view.
 *
 * The list exists for the job the cover grid is worst at: scanning many books
 * at once and rating them in a pass. So every row has the same shape — small
 * cover, title, author, one caption line — and the stars sit in a column of
 * their own on the right, lined up down the page.
 *
 * Same structure as BookCard: the row's opening button and the star control
 * are SIBLINGS, never nested, so a star tap never opens the book.
 */
import React from "react";
import { Box, ButtonBase, Checkbox, Typography, useTheme } from "@mui/material";
import { Check as CheckIcon } from "@mui/icons-material";
import { API_BASE, getCoverUrl } from "../utils/bookDisplay";
import { canRate } from "../utils/rating";
import { formatReadingDate } from "../views/detail/bookFacts";
import StarRating from "./StarRating";

/**
 * "Mar 2024". Through formatReadingDate, not a plain local format: live finish
 * dates are UTC-midnight calendar days, and read locally the 18 finished on
 * the 1st of a month showed the month before.
 */
function finishedLabel(value) {
  return formatReadingDate(value, { month: "short", year: "numeric" });
}

export default function BookRow({
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

  const shelf = shelves.find((s) => s.id === book.shelf);
  const shelfLabel = shelf && shelf.id !== "all" ? shelf.label : null;
  const shelfColor =
    theme.palette.shelf?.[book.shelf] ?? theme.palette.shelf?.custom ?? "text.muted";
  const finished = finishedLabel(book.dateFinished);
  const rateable = onRate && !selectMode && canRate(book);

  const handleActivate = () => {
    if (selectMode) {
      onToggleSelect?.(bookId);
      return;
    }
    onOpen?.(book);
  };

  return (
    <Box
      data-testid="book-row"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        borderBottom: 1,
        borderColor: "divider",
        ...(selected ? { bgcolor: "action.selected" } : null),
      }}
    >
      {selectMode && (
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect?.(bookId)}
          inputProps={{ "aria-label": `Select ${ title }` }}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        />
      )}

      <ButtonBase
        onClick={handleActivate}
        aria-label={title}
        aria-pressed={selectMode ? selected : undefined}
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.5,
          py: 1,
          px: selectMode ? 0 : 1,
          textAlign: "left",
          borderRadius: "8px",
        }}
      >
        <Box
          sx={{
            width: 40,
            aspectRatio: "2 / 3",
            flexShrink: 0,
            borderRadius: "4px",
            overflow: "hidden",
            bgcolor: "background.default",
          }}
        >
          {bookId ? (
            <Box
              component="img"
              src={getCoverUrl(book) || `${ API_BASE }/books/${ bookId }/cover`}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </Typography>
          <Typography variant="body2" noWrap sx={{ color: "text.secondary" }}>
            {authors}
          </Typography>
          {(shelfLabel || finished || book.owned) && (
            <Typography
              variant="caption"
              component="p"
              sx={{ color: "text.muted", display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
            >
              {shelfLabel && (
                <Box component="span" sx={{ color: shelfColor, fontWeight: 500, whiteSpace: "nowrap" }}>
                  {shelfLabel}
                </Box>
              )}
              {shelfLabel && finished && <Box component="span">·</Box>}
              {finished && <Box component="span" sx={{ whiteSpace: "nowrap" }}>{finished}</Box>}
              {book.owned && <CheckIcon titleAccess="Owned" sx={{ fontSize: 14 }} />}
            </Typography>
          )}
        </Box>
      </ButtonBase>

      {/* The stars' column. It keeps its width on rows with no stars, so the
          column stays lined up down a mixed shelf. */}
      <Box sx={{ width: { xs: 132, sm: 160 }, flexShrink: 0, pr: { xs: 0.5, sm: 1 } }}>
        {rateable && (
          <StarRating
            value={book.rating}
            label={title}
            variant="row"
            onChange={(n) => onRate(book, n)}
          />
        )}
      </Box>
    </Box>
  );
}
