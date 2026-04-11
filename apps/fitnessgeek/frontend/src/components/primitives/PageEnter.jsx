import React from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';

// ─── Subtle mount animation: fade + 6px rise, settle ───
const pageEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

/**
 * PageEnter — wraps a page in a subtle one-time entry animation.
 *
 * 420ms with a cubic-bezier that settles gently. Respects prefers-reduced-motion.
 * Drop-in replacement for the page's outermost Box.
 */
const PageEnter = ({ children, sx, ...rest }) => (
  <Box
    sx={{
      animation: `${pageEnter} 420ms cubic-bezier(0.22, 1, 0.36, 1)`,
      '@media (prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
      ...sx,
    }}
    {...rest}
  >
    {children}
  </Box>
);

export default PageEnter;
