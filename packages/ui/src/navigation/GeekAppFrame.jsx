/**
 * GeekAppFrame — shared main content area with route transitions.
 *
 * Owns:
 *   - <main> flex container with consistent overflow/scroll behavior
 *   - AnimatePresence + motion.div route transition (opacity fade)
 *   - transitionKey derived from top-level path segment only
 *
 * Does NOT own:
 *   - bottom padding beyond the shell's bottom-nav inset (see `bottomInset`)
 *   - sidebar / topbar / drawer behavior
 *   - auth awareness
 *   - any prop smarter than `sx`
 *
 * Usage:
 *   <GeekAppFrame />                       // inset itself when the shell has a
 *                                          // bottom nav (`bottomInset` auto)
 *   <GeekAppFrame bottomInset={false} />   // opt out
 *   <GeekAppFrame bottomInset={88} />      // explicit, app-owned tab bar
 *   <GeekAppFrame fill />                  // frame doesn't scroll itself; the
 *                                          // page owns a flex column instead
 *                                          // (a pinned composer, a board) —
 *                                          // see `fill` below
 *
 * `fill` (DOCS/MOBILE_UI_PLAN.md §4b "Follow-ups surfaced by M3–M5"): a page
 * that pins a composer/board to the frame used to reach through the route
 * `motion.div` with a `& > div` selector (storygeek) to flex it. `fill`
 * builds that contract into the primitive instead: the frame itself becomes
 * a non-scrolling (`overflow: hidden`) flex column, and the route-transition
 * `motion.div` is flexed (`display: flex; flexDirection: column; flex: 1;
 * minHeight: 0`) so the page's own content decides what scrolls. Default
 * behavior (the frame scrolls, the transition div is a plain block) is
 * unchanged when `fill` is omitted. Hook: `data-geek-frame="fill"`.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import { geekLayout, geekMotion } from '../designTokens.js';
import { useReducedMotion } from '../motion.js';
import { useGeekShell } from './shellContext.js';

/**
 * @param {number|boolean} [bottomInset] bottom padding reserved for a mobile
 *   tab bar. Omit to follow the shell (`GeekShell bottomNav`), `true` for
 *   `geekLayout.bottomNavHeight`, a number for an explicit px value, `false`
 *   for none.
 * @param {boolean} [fill] when true, the frame is a flex column that does not
 *   scroll itself, and the route-transition div is flexed so a page can pin
 *   a composer/board to the frame. See the file header.
 */
export function GeekAppFrame({ children, bottomInset, fill = false, sx }) {
  const location = useLocation();
  const shell = useGeekShell();
  const prefersReducedMotion = useReducedMotion();

  const inset =
    bottomInset === undefined
      ? shell.bottomInset
      : bottomInset === true
        ? geekLayout.bottomNavHeight
        : bottomInset || 0;

  // Stable key on top-level segment only.
  // /plan/weekly → /plan/monthly won't re-trigger the transition.
  const transitionKey = '/' + (location.pathname.split('/')[1] || '');

  return (
    <Box
      component="main"
      data-geek-frame={fill ? 'fill' : undefined}
      sx={{
        flex: 1,
        ...(fill
          ? { minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
          : { overflowY: 'auto', overflowX: 'hidden' }),
        bgcolor: 'background.default',
        ...(inset ? { pb: `${inset}px` } : null),
        ...sx,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={transitionKey}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : geekMotion.duration.route / 1000,
          }}
          style={
            fill
              ? { minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }
              : { minHeight: '100%' }
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
