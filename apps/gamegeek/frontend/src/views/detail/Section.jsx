/** A titled block of the detail sheet. */
import React from 'react';
import { Box, Typography } from '@mui/material';

export default function Section({ title, action, children, id, sx }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', p: 2, minWidth: 0, ...sx }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25, minHeight: 32 }}>
        <Typography
          id={headingId}
          component="h3"
          sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}
