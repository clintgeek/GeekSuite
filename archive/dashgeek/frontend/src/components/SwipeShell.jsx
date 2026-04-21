import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * SwipeShell — two-screen shell for `/` (Ambient) and `/suite`.
 *
 * Children order MUST match SCREEN_ROUTES: [Ambient, Suite].
 *
 * Behavior:
 *   - `drag="x"` on an inner motion.div, constrained to the
 *     viewport width so each screen snaps cleanly.
 *   - onDragEnd: snaps to the neighbor when |velocity| > 500 or
 *     |offset| > 40% of viewport width. Otherwise springs back.
 *   - Left / Right arrow keys navigate between screens (respects
 *     input / textarea / contentEditable focus).
 *   - Transitions driven by react-router-dom: dragging commits
 *     by calling `navigate(nextRoute)`; the motion x-value then
 *     animates back to 0 as the new screen mounts.
 */

export const SCREEN_ROUTES = ['/', '/suite'];

function getScreenIndex(pathname) {
  if (pathname === '/' || pathname === '') return 0;
  if (pathname.startsWith('/suite')) return 1;
  return -1;
}

export default function SwipeShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const viewportRef = useRef(null);
  const x = useMotionValue(0);

  const screens = React.Children.toArray(children);
  const activeIndex = getScreenIndex(location.pathname);

  // Reset x whenever the active route changes externally (nav link,
  // browser back/forward, keyboard). Animate briefly so the
  // transition reads as intentional.
  useEffect(() => {
    const controls = animate(x, 0, {
      type: 'spring',
      stiffness: 260,
      damping: 30,
    });
    return controls.stop;
  }, [location.pathname, x]);

  // Keyboard nav — respect typing inside inputs
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      ) {
        return;
      }
      const idx = getScreenIndex(location.pathname);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' && idx < SCREEN_ROUTES.length - 1) {
        e.preventDefault();
        navigate(SCREEN_ROUTES[idx + 1]);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        navigate(SCREEN_ROUTES[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location.pathname]);

  const handleDragEnd = (_event, info) => {
    const width = viewportRef.current?.offsetWidth || window.innerWidth;
    const threshold = width * 0.4;
    const velocityThreshold = 500;

    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const idx = getScreenIndex(location.pathname);
    if (idx < 0) return;

    // Swipe left = go right (next); swipe right = go left (prev)
    const wantsNext =
      (offset < -threshold || velocity < -velocityThreshold) &&
      idx < SCREEN_ROUTES.length - 1;
    const wantsPrev =
      (offset > threshold || velocity > velocityThreshold) && idx > 0;

    if (wantsNext) {
      navigate(SCREEN_ROUTES[idx + 1]);
    } else if (wantsPrev) {
      navigate(SCREEN_ROUTES[idx - 1]);
    } else {
      // Snap back — useEffect above will also trigger on route
      // changes, but here we animate now for a responsive feel.
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 32 });
    }
  };

  // If we somehow rendered with an off-shell pathname, just show
  // the first screen (/) — should not happen in practice because
  // the shell is only mounted under /, /suite routes.
  const visibleIndex = activeIndex < 0 ? 0 : activeIndex;

  return (
    <Box
      ref={viewportRef}
      sx={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        // Lock to below the sticky Brand header
        // (Brand is rendered by the parent DeskLayout).
        touchAction: 'pan-y',
      }}
    >
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={handleDragEnd}
        style={{ x, display: 'block', width: '100%' }}
      >
        {/* Only render the active screen to avoid double-running
            expensive queries; the drag gesture still reads well
            because the drag wrapper has room to travel via
            dragElastic. */}
        <Box sx={{ width: '100%' }}>{screens[visibleIndex]}</Box>
      </motion.div>
    </Box>
  );
}
