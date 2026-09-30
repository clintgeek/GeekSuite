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
 *
 * Used Bookstore (2026-09-30): each shelf is an AISLE SIGN — a small painted
 * green board with cream serif lettering; the shelf you're on is the one
 * painted sticker yellow. The visible board is decorative; the ButtonBase
 * around it is the 44px tab.
 */
import React from "react";
import { Box, ButtonBase } from "@mui/material";
import { SERIF_FONT, STICKER } from "../theme/theme";
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
              borderRadius: "4px",
              scrollSnapAlign: "start",
              "&.Mui-focusVisible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main", outlineOffset: 1 },
              "@media (hover: hover)": { "&:hover [data-aisle-sign]": { transform: "translateY(-1px)" } },
            }}
          >
            <Box
              component="span"
              data-aisle-sign
              data-active={active ? "true" : "false"}
              sx={(t) => ({
                display: "inline-flex",
                alignItems: "baseline",
                gap: 0.75,
                height: 32,
                boxSizing: "border-box",
                px: 1.5,
                pt: "5px",
                borderRadius: "3px",
                transition: "transform 120ms ease-out",
                bgcolor: active ? STICKER.unread.ground : t.palette.sign.board,
                color: active ? STICKER.unread.ink : t.palette.sign.ink,
                // A painted board: a lit top edge, a darker bottom edge.
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 ${active ? "rgba(120, 80, 0, 0.35)" : t.palette.sign.edge}, 0 1px 2px rgba(20, 12, 4, 0.25)`,
                pointerEvents: "none",
              })}
            >
              <Box component="span" sx={{ fontFamily: SERIF_FONT, fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.2, letterSpacing: "0.01em" }}>
                {shelf.label}
              </Box>
              {count ? (
                <Box component="span" sx={(t) => ({ fontSize: "0.75rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: active ? STICKER.unread.ink : t.palette.sign.inkSoft })}>
                  {count}
                </Box>
              ) : null}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
