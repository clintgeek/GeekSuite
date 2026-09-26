/** A titled block of the detail sheet: an outlined arcade panel with a hard shadow and a Bungee label. */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { DISPLAY_FONT, DISPLAY_WEIGHT, hardShadow } from '../../theme/theme';

export default function Section({ title, action, children, id, sx }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        border: '2px solid',
        borderColor: 'border',
        borderRadius: '10px',
        bgcolor: 'background.card',
        boxShadow: (t) => hardShadow(3, t.palette.arcade.shadow),
        p: 2,
        minWidth: 0,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25, minHeight: 32 }}>
        <Typography
          id={headingId}
          component="h3"
          sx={{ fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, fontSize: '0.8125rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.primary' }}
        >
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}
