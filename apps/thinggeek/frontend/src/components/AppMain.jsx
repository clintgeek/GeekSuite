/**
 * The scrolling <main> column: the cardboard floor every page sits on
 * (Moving Day) — kraft by day with a little road dust on it, the dim
 * corridor by night.
 *
 * Not GeekAppFrame, on purpose: this keeps the frame's scroll contract with
 * a small fade keyed on the real destination. Every route is a page now
 * (a thing and the add screen included, since 2026-09-29); arriving on
 * one starts at its top, except the library, which puts itself back where
 * you left it (useScrollMemory) — so a reset here must not undo that.
 *
 * The element is published as the scroll root so the infinite-scroll
 * sentinel can look ahead inside it (an IntersectionObserver on the viewport
 * cannot see past this container's clip), and so sticky bars inside a page
 * know what they stick to.
 */
import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { Box } from '@mui/material';
import { dustImage } from '../theme/theme';

const ScrollRootContext = createContext(null);
export const useScrollRoot = () => useContext(ScrollRootContext);

export default function AppMain({ children, transitionKey }) {
  const [node, setNode] = useState(null);
  useLayoutEffect(() => {
    if (node && transitionKey !== 'library') node.scrollTop = 0;
  }, [node, transitionKey]);
  return (
    <Box
      component="main"
      ref={setNode}
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor: 'background.desk',
        // Dust and scuffs: one tiled SVG noise, static and cheap (measured under text).
        backgroundImage: (t) => dustImage(t.palette.mode),
        backgroundAttachment: 'local',
      }}
    >
      <ScrollRootContext.Provider value={node}>
        <Box key={transitionKey} sx={{ minHeight: '100%', animation: 'tg-fade-in 180ms ease-out' }}>
          {children}
        </Box>
      </ScrollRootContext.Provider>
    </Box>
  );
}
