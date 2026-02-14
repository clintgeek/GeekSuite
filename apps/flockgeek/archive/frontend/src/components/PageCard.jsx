import React from 'react';
import { Paper, Stack, Typography, Box } from '@mui/material';

export default function PageCard({ title, actions, children, sx }) {
  return (
    <Paper
      sx={{
        p: { xs: 2, sm: 3 },
        mb: 3,
        borderRadius: 2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        ...sx
      }}
      elevation={0}
    >
      {(title || actions) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: title ? 3 : 0 }}
        >
          <Typography variant="h5" fontWeight={600} color="text.primary">
            {title}
          </Typography>
          <Box>{actions}</Box>
        </Stack>
      )}
      <Box>
        {children}
      </Box>
    </Paper>
  );
}
