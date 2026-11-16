/**
 * The scrolling <main> column: the newsprint every page is set on. A
 * centred measure keeps lines readable on a wide screen — a paper's column,
 * not a dashboard.
 *
 * Where the reader lands (SUITE_REVIEW_2026-11 NewsGeek finding 2):
 *  - a new page (a link, a tab: PUSH/REPLACE) starts at its top;
 *  - Back/Forward (POP) — including the page load after Back from a story
 *    opened in this window — returns to where they were on that page
 *    (hooks/scrollMemory.js), once the stories are there to scroll to.
 *
 * It also provides the scroll container to the views (hooks/scrollRoot.js),
 * so a resume refresh can tell whether the reader is at the top.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useLocation, useNavigationType } from 'react-router-dom';
import { ScrollRootContext } from '../hooks/scrollRoot';
import { placeKey, readScroll, restoreScroll, writeScroll } from '../hooks/scrollMemory';

const SAVE_DEBOUNCE_MS = 150;

export default function AppMain({ children, transitionKey }) {
  const [node, setNode] = useState(null);
  const nodeRef = useRef(null);
  nodeRef.current = node;
  const location = useLocation();
  const navType = useNavigationType();
  const key = placeKey(location);
  // The page the current scrollTop belongs to; saved under that key.
  const current = useRef({ key, top: 0 });

  useLayoutEffect(() => {
    if (!node) return undefined;
    // The page being left keeps its place (synchronously: a debounced save may still be pending).
    if (current.current.key !== key) writeScroll(current.current.key, current.current.top);
    current.current = { key, top: 0 };
    const saved = navType === 'POP' ? readScroll(key) : 0;
    node.scrollTop = 0;
    if (!saved) return undefined;
    current.current.top = saved;
    return restoreScroll(node, saved);
    // A new history entry (location.key), not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, location.key]);

  // Remember the position as the reader scrolls, and when the page goes away
  // (a story opened in this window unloads NewsGeek).
  useEffect(() => {
    if (!node) return undefined;
    let timer = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      writeScroll(current.current.key, current.current.top);
    };
    const onScroll = () => {
      current.current.top = node.scrollTop;
      const snap = { ...current.current };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        writeScroll(snap.key, snap.top);
      }, SAVE_DEBOUNCE_MS);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', flush);
    return () => {
      node.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
      if (timer) flush();
    };
  }, [node]);

  return (
    <ScrollRootContext.Provider value={nodeRef}>
      <Box
        component="main"
        ref={setNode}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', bgcolor: 'background.default' }}
      >
        <Box key={transitionKey} sx={{ minHeight: '100%', animation: 'ng-fade-in 160ms ease-out' }}>
          {children}
        </Box>
      </Box>
    </ScrollRootContext.Provider>
  );
}
