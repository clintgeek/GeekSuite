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
        maxWidth: narrow ? 720 : 1080,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        pt: { xs: 2, sm: 3 },
        pb: fab ? { xs: clear, sm: clear, md: 4 } : { xs: 3, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1.75, md: 2.25 },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
