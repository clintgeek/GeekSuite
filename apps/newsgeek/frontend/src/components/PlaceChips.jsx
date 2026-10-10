/**
 * Places as outlined tags: hairline border, ink text, no fill (the 12px
 * filled-chip contrast landmine never applies — the ground is the page).
 */
import React from 'react';
import { Box } from '@mui/material';
import { GOTHIC } from '../theme/theme';

export default function PlaceChips({ places = [], sx }) {
  if (!places.length) return null;
  return (
    <Box component="ul" aria-label="Places" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1.5, ...sx }}>
      {places.map((p) => (
        <Box
          component="li"
          key={p.id}
          sx={{
            fontFamily: GOTHIC,
            fontSize: '0.75rem',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '0.02em',
            color: 'text.secondary',
            border: 1,
            borderColor: 'divider',
            borderRadius: '2px',
            px: 1.5,
            py: 0.5,
          }}
        >
          {p.name}
        </Box>
      ))}
    </Box>
  );
}
