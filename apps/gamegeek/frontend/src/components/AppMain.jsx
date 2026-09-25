/**
 * The scrolling <main> column.
 *
 * Not GeekAppFrame, on purpose: the frame keys its route transition on the
 * top-level path segment, so `/` → `/game/:id` would unmount the library
 * under the detail sheet (losing its pages and scroll position) just to fade
 * it back in. The detail sheet and the add dialog are overlays ON the
 * library, so the library must stay mounted. This keeps the frame's scroll
 * contract and adds a small fade keyed on the real destination instead.
 *
 * The element is published as the scroll root so the infinite-scroll
 * sentinel can look ahead inside it (an IntersectionObserver on the viewport
 * cannot see past this container's clip).
 */
import React, { createContext, useContext, useState } from 'react';
import { Box } from '@mui/material';

const ScrollRootContext = createContext(null);
export const useScrollRoot = () => useContext(ScrollRootContext);

export default function AppMain({ children, transitionKey }) {
  const [node, setNode] = useState(null);
  return (
    <Box
      component="main"
      ref={setNode}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', bgcolor: 'background.default' }}
    >
      <ScrollRootContext.Provider value={node}>
        <Box key={transitionKey} sx={{ minHeight: '100%', animation: 'gg-fade-in 180ms ease-out' }}>
          {children}
        </Box>
      </ScrollRootContext.Provider>
    </Box>
  );
}
