/**
 * The front-page masthead: a heavy rule, the nameplate, the paper's patch,
 * then the dateline between hairlines. The date is America/Chicago
 * ("Saturday, October 10, 2026"), whatever zone the phone is in.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { SERIF, flagSx } from '../theme/theme';
import { mastheadDate } from '../utils/dates';

export default function Masthead({ now, edition = 'Latest edition' }) {
  const date = mastheadDate(now ?? new Date());
  return (
    <Box component="header" sx={{ textAlign: 'center', pt: 4, pb: 0 }}>
      <Box sx={{ borderTop: 4, borderColor: 'text.primary', pt: 3 }} />
      <Typography
        component="h1"
        sx={{
          fontFamily: SERIF,
          fontWeight: 800,
          fontSize: { xs: '2.75rem', sm: '3.5rem', md: '4rem' },
          lineHeight: 1,
          letterSpacing: '-0.025em',
          color: 'text.primary',
        }}
      >
        NewsGeek
      </Typography>
      <Typography component="p" sx={{ ...flagSx, color: 'text.secondary', mt: 2 }}>
        Clark &amp; Hot Spring Counties · Arkansas
      </Typography>
      <Box
        sx={{
          mt: 3,
          py: 2,
          borderTop: 1,
          borderBottom: 1,
          borderColor: 'text.primary',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          columnGap: 4,
          rowGap: 1,
        }}
      >
        <Typography component="p" data-testid="masthead-date" sx={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '1rem', color: 'text.primary' }}>
          {date}
        </Typography>
        <Typography component="p" sx={{ ...flagSx, color: 'text.secondary' }}>
          {edition}
        </Typography>
      </Box>
    </Box>
  );
}
