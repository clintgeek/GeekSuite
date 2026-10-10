/** The reading measure: a centred column with the 16px phone gutter. */
import React from 'react';
import { Box } from '@mui/material';

export default function Column({ children, wide = false, sx }) {
  return (
    <Box sx={{ maxWidth: wide ? 960 : 720, mx: 'auto', px: { xs: 4, sm: 6 }, pb: 10, ...sx }}>{children}</Box>
  );
}
