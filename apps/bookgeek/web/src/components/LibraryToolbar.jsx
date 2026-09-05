/**
 * LibraryToolbar — one 44px row above the grid (MOBILE_UI_PLAN.md §3.1).
 *
 *   223 books                            [ Title ↑ ]  [ Filter •2 ]
 *
 * Both pills open the same `FilterSheet` (a bottom sheet below `md`, a dialog
 * above it), so sort and filter are one surface at every size instead of the
 * old five-row wrap of 11px controls. Active filters render underneath as
 * removable 12px chips, exactly as they did before.
 */
import React from "react";
import { Badge, Box, Button, Chip, Typography } from "@mui/material";
import { FilterList as FilterIcon } from "@mui/icons-material";
import { SORT_LABELS } from "./librarySort";

const pillSx = {
  borderRadius: "999px",
  px: 2,
  py: 0.5,
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "text.primary",
  borderColor: "divider",
  whiteSpace: "nowrap",
};

export default function LibraryToolbar({
  total,
  sortBy,
  sortDir,
  onOpenSort,
  onOpenFilter,
  activeFilterCount,
  shelves,
  shelfFilter,
  setShelfFilter,
  searchQuery,
  setSearchQuery,
  authorFilter,
  setAuthorFilter,
  tagFilter,
  setTagFilter,
}) {
  const shelfLabel =
    shelves.find((s) => s.id === shelfFilter)?.label || shelfFilter;

  const hasChips =
    searchQuery.trim() ||
    authorFilter.trim() ||
    tagFilter.trim() ||
    shelfFilter !== "all";

  const chipSx = { fontSize: "0.75rem", height: 28 };

  return (
    <Box>
      <Box
        sx={{
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary", minWidth: 0 }} noWrap>
          {total} {total === 1 ? "book" : "books"}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            onClick={onOpenSort}
            aria-label={`Sort: ${ SORT_LABELS[sortBy] || sortBy }, ${
              sortDir === "asc" ? "ascending" : "descending"
            }`}
            sx={pillSx}
          >
            {SORT_LABELS[sortBy] || sortBy} {sortDir === "asc" ? "↑" : "↓"}
          </Button>
          <Badge
            badgeContent={activeFilterCount}
            color="primary"
            overlap="circular"
            sx={{ "& .MuiBadge-badge": { fontSize: "0.6875rem" } }}
          >
            <Button
              variant="outlined"
              onClick={onOpenFilter}
              startIcon={<FilterIcon sx={{ fontSize: 18 }} />}
              sx={pillSx}
            >
              Filter
            </Button>
          </Badge>
        </Box>
      </Box>

      {hasChips ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
          {shelfFilter !== "all" && (
            <Chip
              size="small"
              variant="outlined"
              label={`Shelf: ${ shelfLabel }`}
              onDelete={() => setShelfFilter("all")}
              sx={chipSx}
            />
          )}
          {searchQuery.trim() && (
            <Chip
              size="small"
              variant="outlined"
              label={`Search: ${ searchQuery.trim() }`}
              onDelete={() => setSearchQuery("")}
              sx={chipSx}
            />
          )}
          {authorFilter.trim() && (
            <Chip
              size="small"
              variant="outlined"
              label={`Author: ${ authorFilter.trim() }`}
              onDelete={() => setAuthorFilter("")}
              sx={chipSx}
            />
          )}
          {tagFilter.trim() && (
            <Chip
              size="small"
              variant="outlined"
              label={`Tag: ${ tagFilter.trim() }`}
              onDelete={() => setTagFilter("")}
              sx={chipSx}
            />
          )}
          <Button
            size="small"
            onClick={() => {
              setSearchQuery("");
              setAuthorFilter("");
              setTagFilter("");
              setShelfFilter("all");
            }}
            sx={{ fontSize: "0.75rem", minHeight: 28, py: 0, px: 1 }}
          >
            Clear all
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
