/**
 * The top of a non-library page: a lede that says what the page is for, and
 * actions. The top bar carries the page's title in fleet lettering at every
 * size, so the heading here is visually hidden (still the page's <h1>) — a
 * second title saying the same thing right under it was noise.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { visuallyHidden } from '../utils/a11y';

export default function PageHeader({ title, lede, actions, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'flex-end' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: { xs: 2, md: 3 }, ...sx }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h1" component="h1" sx={visuallyHidden}>
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
