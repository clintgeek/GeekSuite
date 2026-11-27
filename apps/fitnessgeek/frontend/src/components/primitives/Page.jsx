import React from 'react';
import { Box } from '@mui/material';

/**
 * The one page container (DOCS/THEME_REVIEW_2026-11.md, item 13). Every
 * routed page wraps its content in this, so the left edge and the width do
 * not jump as you move between pages on a desktop.
 *
 * `narrow` is for forms and settings (a readable measure); `fab` leaves room
 * under the last panel for a floating action on phones and portrait tablets.
 * Note the `sm` key on `pb`: without it the `sm` padding below wins over the
 * `xs` clearance on a tablet (the 2026-11-26 Blood pressure bug).
 */
export default function Page({ narrow = false, fab = false, children, sx, ...rest }) {
  const clear = 'calc(88px + env(safe-area-inset-bottom))';
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: narrow ? 760 : 1160,
        mx: 'auto',
        px: { xs: 4, sm: 6, md: 8 },
        pt: { xs: 4, sm: 6 },
        pb: fab ? { xs: clear, sm: clear, md: 8 } : { xs: 6, md: 8 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 4, md: 5 },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
