/**
 * BookGeek library card — one book in the grid.
 *
 * The Pocket Pass rules (DOCS/MOBILE_UI_PLAN.md §3.1): the whole card is the
 * tap target, the cover carries the amber progress bar on its bottom edge
 * instead of a separate row, and the shelf state is one 12px caption line
 * ("Reading · 42% ✓") instead of a 9px pill. The per-card basket "+" is gone —
 * bulk basket work happens in Select mode, from the filter sheet's overflow.
 */
import React from "react";
import { Box, Card, ButtonBase, Checkbox, Typography, alpha, useTheme } from "@mui/material";
import { Check as CheckIcon } from "@mui/icons-material";
import { API_BASE, getCoverUrl } from "../utils/bookDisplay";

export default function BookCard({
  book,
  shelves,
  selectMode = false,
  selected = false,
  onOpen,
  onToggleSelect,
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
  // shows the percentage only while a book is in progress. The cover bar
  // still fills, which is the quiet way to say the same thing.
  const inProgress = progress > 0 && progress < 100;

  const shelf = shelves.find((s) => s.id === book.shelf);
  const shelfLabel = shelf && shelf.id !== "all" ? shelf.label : null;
  const shelfColor =
    theme.palette.shelf?.[book.shelf] ?? theme.palette.shelf?.custom ?? "text.muted";

  const handleActivate = () => {
    if (selectMode) {
      onToggleSelect?.(bookId);
      return;
    }
    onOpen?.(book);
  };

  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        transition: theme.transitions.create(["transform", "border-color"]),
        ...(selected
          ? { borderColor: "primary.main", boxShadow: `0 0 0 1px ${ theme.palette.primary.main }` }
          : null),
        "@media (hover: hover)": {
          "&:hover": { transform: "translateY(-2px)" },
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
          p: 1,
          borderRadius: "inherit",
        }}
      >
        <Box
          sx={{
            position: "relative",
            aspectRatio: "2 / 3",
            width: "100%",
            borderRadius: "8px",
            overflow: "hidden",
            bgcolor: "background.default",
            mb: 1,
          }}
        >
          {bookId ? (
            <Box
              component="img"
              src={getCoverUrl(book) || `${ API_BASE }/books/${ bookId }/cover`}
              alt=""
              loading="lazy"
              onLoad={(e) => {
                e.currentTarget.style.visibility = "visible";
              }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
          {progress > 0 && (
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "3px",
                bgcolor: alpha(theme.palette.common.black, 0.4),
              }}
            >
              <Box
                sx={{
                  height: "100%",
                  width: `${ progress }%`,
                  bgcolor: "progress.main",
                }}
              />
            </Box>
          )}
        </Box>

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
        {(shelfLabel || inProgress || book.owned) && (
          <Typography
            variant="caption"
            component="p"
            sx={{
              mt: 0.25,
              color: "text.muted",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
            }}
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
            {book.owned && (
              <CheckIcon
                titleAccess="Owned"
                sx={{ fontSize: 14, ml: shelfLabel || inProgress ? 0 : -0.25 }}
              />
            )}
          </Typography>
        )}
      </ButtonBase>

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
    </Card>
  );
}
