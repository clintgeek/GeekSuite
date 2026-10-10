/**
 * OFFICIAL: the one place the spot colour is spent. Spot ink on the spot
 * tint, set in small capitals — a word, not just a colour.
 */
import React from 'react';
import { Box } from '@mui/material';
import { GavelOutlined } from '@mui/icons-material';
import { flagSx } from '../theme/theme';

export default function OfficialBadge({ label = 'Official', sx }) {
  return (
    <Box
      component="span"
      data-testid="official-badge"
      sx={{
        ...flagSx,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        lineHeight: 1.2,
        color: 'official.main',
        bgcolor: 'official.tint',
        border: 1,
        borderColor: 'official.main',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      <GavelOutlined aria-hidden="true" sx={{ fontSize: 14 }} />
      {label}
    </Box>
  );
}
