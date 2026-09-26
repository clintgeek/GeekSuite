import React from 'react';
import { Box, Typography } from '@mui/material';

export default function SettingsCard({ id, title, description, children, sx }) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', p: { xs: 2, md: 2.5 }, scrollMarginTop: 16, ...sx }}
    >
      <Typography id={`${id}-title`} variant="h3" component="h2" sx={{ fontSize: '1.0625rem', mb: description ? 0.5 : 1.5 }}>
        {title}
      </Typography>
      {description ? (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 2, lineHeight: 1.6 }}>{description}</Typography>
      ) : null}
      {children}
    </Box>
  );
}
