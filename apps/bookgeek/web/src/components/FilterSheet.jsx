/**
 * FilterSheet — sort, narrow, saved filters and the library's overflow menu.
 *
 * One surface for everything the old toolbar wrapped across five rows. Below
 * `md` `GeekSheet` renders it as a bottom sheet with the primary action in the
 * thumb zone; at `md`+ the same markup is a centered dialog
 * (DOCS/MOBILE_UI_PLAN.md §2, §3.1).
 */
import React from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  CheckBoxOutlined as SelectIcon,
  MergeType as MergeIcon,
} from "@mui/icons-material";
import { GeekSheet, GeekTextField } from "@geeksuite/ui";
import { SORT_LABELS, SORT_ORDER } from "./librarySort";

function SectionLabel({ children }) {
  return (
    <Typography
      variant="caption"
      component="h3"
      sx={{
        display: "block",
        color: "text.muted",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

const toggleSx = {
  flex: "0 0 auto",
  minHeight: 44,
  px: 2,
  borderRadius: "999px !important",
  border: "1px solid",
  borderColor: "divider",
  textTransform: "none",
  fontSize: "0.8125rem",
  color: "text.secondary",
  "&.Mui-selected": {
    bgcolor: "primary.main",
    color: "primary.contrastText",
    borderColor: "primary.main",
    "&:hover": { bgcolor: "primary.dark" },
  },
};

export default function FilterSheet({
  open,
  onClose,
  total,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  authorFilter,
  setAuthorFilter,
  tagFilter,
  setTagFilter,
  setShelfFilter,
  setSearchQuery,
  savedFilters = [],
  savedFiltersError,
  applySavedFilter,
  handleSaveCurrentFilter,
  saveFilterLoading,
  onEnterSelectMode,
  showMergeUi,
  handleMergeSelectedBooks,
  mergeLoading,
  selectedBookIds = [],
}) {
  const resetAll = () => {
    setSortBy("title");
    setSortDir("asc");
    setSearchQuery("");
    setAuthorFilter("");
    setTagFilter("");
    setShelfFilter("all");
  };

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="h3" component="p">
            Sort &amp; filter
          </Typography>
          <Button onClick={resetAll} sx={{ fontSize: "0.8125rem" }}>
            Reset
          </Button>
        </Box>
      }
      actions={
        <Button variant="contained" fullWidth onClick={onClose}>
          Show {total} {total === 1 ? "book" : "books"}
        </Button>
      }
    >
      <Box sx={{ pt: 1, pb: 2 }}>
        <SectionLabel>Sort by</SectionLabel>
        <ToggleButtonGroup
          exclusive
          value={sortBy}
          onChange={(_e, value) => {
            if (value) setSortBy(value);
          }}
          sx={{ display: "flex", flexWrap: "wrap", gap: 1, "& .MuiToggleButton-root": toggleSx }}
        >
          {SORT_ORDER.map((id) => (
            <ToggleButton key={id} value={id}>
              {SORT_LABELS[id]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box sx={{ mt: 2.5 }}>
          <SectionLabel>Direction</SectionLabel>
          <ToggleButtonGroup
            exclusive
            value={sortDir}
            onChange={(_e, value) => {
              if (value) setSortDir(value);
            }}
            sx={{ display: "flex", flexWrap: "wrap", gap: 1, "& .MuiToggleButton-root": toggleSx }}
          >
            <ToggleButton value="asc">Ascending</ToggleButton>
            <ToggleButton value="desc">Descending</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <SectionLabel>Narrow by</SectionLabel>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <GeekTextField
            label="Author"
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            fullWidth
          />
          <GeekTextField
            label="Tag or genre"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            fullWidth
          />
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <SectionLabel>Saved filters</SectionLabel>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {savedFilters.map((preset) => (
            <Chip
              key={preset.id}
              clickable
              variant="outlined"
              onClick={() => applySavedFilter?.(preset)}
              label={preset.name || "(unnamed)"}
              sx={{ height: 32, fontSize: "0.75rem" }}
            />
          ))}
          <Chip
            clickable
            variant="outlined"
            icon={<AddIcon sx={{ fontSize: 16 }} />}
            disabled={saveFilterLoading}
            onClick={() => handleSaveCurrentFilter?.()}
            label={saveFilterLoading ? "Saving…" : "Save current"}
            sx={{ height: 32, fontSize: "0.75rem", borderStyle: "dashed" }}
          />
        </Box>
        {savedFiltersError ? (
          <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 1 }}>
            {savedFiltersError}
          </Typography>
        ) : null}

        <Divider sx={{ my: 2.5 }} />

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <Button
            startIcon={<SelectIcon />}
            onClick={() => {
              onEnterSelectMode?.();
              onClose?.();
            }}
            sx={{ justifyContent: "flex-start", color: "text.primary" }}
          >
            Select books…
          </Button>
          {showMergeUi ? (
            <Button
              startIcon={<MergeIcon />}
              disabled={mergeLoading || selectedBookIds.length !== 2}
              onClick={() => {
                handleMergeSelectedBooks?.();
                onClose?.();
              }}
              sx={{ justifyContent: "flex-start", color: "text.primary" }}
            >
              {mergeLoading
                ? "Merging…"
                : `Merge selected (${ selectedBookIds.length || 0 }/2)`}
            </Button>
          ) : null}
        </Box>
      </Box>
    </GeekSheet>
  );
}
