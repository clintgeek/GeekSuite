/**
 * ShelfStrip — the shelf nav on a phone (DOCS/MOBILE_UI_PLAN.md §3.1).
 *
 * A horizontally scrolling chip row under the top bar: All · Reading · On
 * Reader · … with counts from the shelf summary. Mobile only — at `md`+ the
 * sidebar already lists the shelves, so this hides rather than duplicating it.
 */
import React from "react";
import { Box, Chip } from "@mui/material";
import { shelfCount } from "./navConfig";

export default function ShelfStrip({
  shelves,
  shelfSummary,
  shelfFilter,
  setShelfFilter,
  setActiveView,
}) {
  const entries = [
    { id: "all", label: "All" },
    ...shelves.filter((s) => s.id !== "all"),
  ];

  return (
    <Box
      role="tablist"
      aria-label="Shelves"
      sx={{
        display: { xs: "flex", md: "none" },
        gap: 1,
        px: 2,
        py: 1,
        overflowX: "auto",
        scrollSnapType: "x proximity",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {entries.map((shelf) => {
        const active = shelfFilter === shelf.id;
        const count = shelfCount(shelfSummary, shelf.id);
        return (
          <Chip
            key={shelf.id}
            role="tab"
            aria-selected={active}
            clickable
            onClick={() => {
              setShelfFilter(shelf.id);
              setActiveView("library");
            }}
            label={
              <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.75 }}>
                <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  {shelf.label}
                </Box>
                {count ? (
                  <Box
                    component="span"
                    sx={{
                      fontFamily: '"Roboto Mono", monospace',
                      fontSize: "0.75rem",
                      opacity: 0.7,
                    }}
                  >
                    {count}
                  </Box>
                ) : null}
              </Box>
            }
            variant={active ? "filled" : "outlined"}
            sx={{
              flex: "0 0 auto",
              height: 32,
              scrollSnapAlign: "start",
              borderRadius: "16px",
              ...(active
                ? {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    borderColor: "primary.main",
                    "&:hover": { bgcolor: "primary.dark" },
                  }
                : { color: "text.secondary" }),
            }}
          />
        );
      })}
    </Box>
  );
}
