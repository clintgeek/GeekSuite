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
 *
 * The element is published as the scroll root (`useScrollRoot`), so the
 * infinite-scroll sentinel can look ahead inside it (an IntersectionObserver
 * on the viewport cannot see past this container's clip) and the library can
 * remember where it was scrolled.
 */
import React, { createContext, useContext, useState } from "react";
import { Box } from "@mui/material";
import { geekMotion, useGeekShell } from "@geeksuite/ui";

const ScrollRootContext = createContext(null);
export const useScrollRoot = () => useContext(ScrollRootContext);

export default function AppMain({ children, transitionKey }) {
  const shell = useGeekShell();
  const inset = shell?.bottomInset || 0;
  const [node, setNode] = useState(null);
  return (
    <Box
      component="main"
      ref={setNode}
      sx={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        bgcolor: "background.default",
        ...(inset ? { pb: `${ inset }px` } : null),
      }}
    >
      <ScrollRootContext.Provider value={node}>
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
      </ScrollRootContext.Provider>
    </Box>
  );
}
