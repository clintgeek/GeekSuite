/**
 * The ThingGeek mark (Storage Yard): a storage box, three-quarter
 * view, with the orange band and a hand-hold — the same drawing as the app
 * icon (public/icons/icon.svg), simplified for small sizes. Used in the
 * brand, the boot screen and the members-only page; never in working chrome.
 */
import React from 'react';
import { Box } from '@mui/material';
import { LIVERY } from '../theme/theme';

export default function BoxMark({ size = 28, title, sx }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      sx={{ width: size, height: size, display: 'block', flexShrink: 0, ...sx }}
    >
      <path d="M3 10 L8 6 H29 L24 10 Z" fill="#D9AE78" stroke="#16120D" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M24 10 L29 6 V24 L24 28 Z" fill="#A87A45" stroke="#16120D" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="3" y="10" width="21" height="18" fill="#C99A62" stroke="#16120D" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14 10 L19 6 H21 L16 10 Z" fill="#EAD7B5" />
      <rect x="9.5" y="12.5" width="8" height="2.6" rx="1.3" fill="#16120D" />
      <rect x="3.6" y="18" width="19.8" height="5" fill={LIVERY.orange} />
      <path d="M24.6 23 L28.4 20 V16.6 L24.6 19.6 Z" fill={LIVERY.deep} />
    </Box>
  );
}
