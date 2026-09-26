/**
 * The scrolling <main> column — GeekAppFrame's contract, minus one thing.
 *
 * Not GeekAppFrame, on purpose (GameGeek's `components/AppMain.jsx` hit the
 * same wall): the frame keys its route transition on the top-level path
 * segment, so `/` → `/book/:id` would UNMOUNT the library under the detail
 * sheet — its scroll position gone, every card rebuilt — just to fade it back
 * in. The sheet is an overlay ON the library, so the library must stay
 * mounted. This keeps the frame's scroll box and its 180ms opacity fade, keyed
 * on the view instead (the library and a sheet over it are one view;
 * Settings is another).
 */
import React from "react";
import { Box } from "@mui/material";
import { geekMotion, useGeekShell } from "@geeksuite/ui";

export default function AppMain({ children, transitionKey }) {
  const shell = useGeekShell();
  const inset = shell?.bottomInset || 0;
  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        bgcolor: "background.default",
        ...(inset ? { pb: `${ inset }px` } : null),
      }}
    >
      <Box
        key={transitionKey}
        sx={{
          minHeight: "100%",
          "@keyframes bookgeekRouteFade": { from: { opacity: 0 }, to: { opacity: 1 } },
          animation: `bookgeekRouteFade ${ geekMotion?.duration?.route ?? 180 }ms ease-out`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
