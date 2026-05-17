/**
 * GeekAppFrame — shared main content area with route transitions.
 *
 * Owns:
 *   - <main> flex container with consistent overflow/scroll behavior
 *   - AnimatePresence + motion.div route transition (opacity fade)
 *   - transitionKey derived from top-level path segment only
 *
 * Does NOT own:
 *   - bottom padding (app-specific: tab bar height varies per app)
 *   - sidebar / topbar / drawer behavior
 *   - auth awareness
 *   - any prop smarter than `sx`
 *
 * Usage:
 *   <GeekAppFrame sx={{ pb: isMobile ? `${MOBILE_TAB_HEIGHT}px` : 0 }}>
 *     {children}
 *   </GeekAppFrame>
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import { geekMotion } from '../designTokens.js';

export function GeekAppFrame({ children, sx }) {
  const location = useLocation();

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
