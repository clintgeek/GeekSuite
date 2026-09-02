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
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import { geekLayout, geekMotion } from '../designTokens.js';
import { useGeekShell } from './shellContext.js';

/**
 * @param {number|boolean} [bottomInset] bottom padding reserved for a mobile
 *   tab bar. Omit to follow the shell (`GeekShell bottomNav`), `true` for
 *   `geekLayout.bottomNavHeight`, a number for an explicit px value, `false`
 *   for none.
 */
export function GeekAppFrame({ children, bottomInset, sx }) {
  const location = useLocation();
  const shell = useGeekShell();

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
      sx={{
        flex:      1,
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor:   'background.default',
        ...(inset ? { pb: `${inset}px` } : null),
        ...sx,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={transitionKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: geekMotion.duration.route / 1000 }}
          style={{ minHeight: '100%' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
