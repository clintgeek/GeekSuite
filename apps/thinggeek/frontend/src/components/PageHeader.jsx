/**
 * The top of a non-library page: a display-face title (the top bar already
 * names the page, so on a phone the heading is visually hidden and only the
 * lede shows), a lede that says what the page is for, and actions.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';

export default function PageHeader({ title, lede, actions, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'flex-end' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: { xs: 2, md: 3 }, ...sx }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.875rem' }, lineHeight: 1.15, mb: lede ? 0.75 : 0 }}>
          {title}
        </Typography>
        {lede ? (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.6, maxWidth: 640 }}>{lede}</Typography>
        ) : null}
      </Box>
      {actions ? <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>{actions}</Box> : null}
    </Box>
  );
}

/** The column every non-library page sits in. */
export function PageFrame({ children, maxWidth = 960, sx }) {
  return <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 2.5, md: 4 }, pb: { xs: 12, md: 8 }, maxWidth, mx: 'auto', ...sx }}>{children}</Box>;
}
