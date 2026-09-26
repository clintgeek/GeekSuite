/**
 * ShelfStrip — the shelf nav on a phone (DOCS/MOBILE_UI_PLAN.md §3.1).
 *
 * A horizontally scrolling chip row under the top bar: All · Reading · On
 * Reader · … with counts from the shelf summary. Mobile only — at `md`+ the
 * sidebar already lists the shelves, so this hides rather than duplicating it.
 *
 * Kept beside the Filters sheet (Phase C2), as GameGeek kept its strip: the
 * shelf is how BookGeek is read ("what am I reading", "what's on the
 * Kindle"), and on a phone the sheet and the drawer are both two taps away
 * where this is one. `value` is the one shelf on ("all" for none, null when
 * several are picked in the sheet — then no chip lights).
 */
import React from "react";
import { Box, ButtonBase, Chip } from "@mui/material";
import { shelfCount } from "./navConfig";

export default function ShelfStrip({
  shelves,
  shelfSummary,
  value,
  onChange,
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
        const active = value === shelf.id;
        const count = shelfCount(shelfSummary, shelf.id);
        return (
          // The visible chip stays 32px tall; the ButtonBase around it is the
          // actual tap target (44px, DOCS/MOBILE_UI_PLAN.md §2) — the chip
          // itself is decorative and non-interactive so only one element in
          // the row answers to role="tab".
          <ButtonBase
            key={shelf.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(shelf.id)}
            sx={{
              flex: "0 0 auto",
              minHeight: 44,
              borderRadius: "16px",
              scrollSnapAlign: "start",
              ...(active && {
                "&:hover .MuiChip-root": { bgcolor: "primary.dark" },
              }),
            }}
          >
            <Chip
              component="span"
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
                height: 32,
                borderRadius: "16px",
                pointerEvents: "none",
                ...(active
                  ? {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      borderColor: "primary.main",
                    }
                  : { color: "text.secondary" }),
              }}
            />
          </ButtonBase>
        );
      })}
    </Box>
  );
}
