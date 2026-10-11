/**
 * Why a story is on Today (NewsArticle.why, plan "Ranking": "if it can't be a
 * chip it isn't in the score"): "Arkadelphia", "★ Favorite", "Arkansas"…
 *
 * Quiet on purpose: the same outlined tag as PlaceChips (hairline border,
 * soft ink, no fill — the 12px filled-chip contrast landmine never applies),
 * so the headline stays the loudest thing in the story. "Official" is left
 * out when the story already wears the OFFICIAL badge: the badge is that chip.
 */
import React from 'react';
import { Box } from '@mui/material';
import { GOTHIC } from '../theme/theme';

export const OFFICIAL_CHIP = 'Official';

export function visibleWhy(why = [], { official = false } = {}) {
  return why.filter((w) => w && !(official && w === OFFICIAL_CHIP));
}

export default function WhyChips({ why = [], official = false, sx }) {
  const chips = visibleWhy(why, { official });
  if (!chips.length) return null;
  return (
    <Box component="ul" aria-label="Why it’s here" data-testid="why-chips" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1.5, ...sx }}>
      {chips.map((w) => (
        <Box
          component="li"
          key={w}
          data-testid="why-chip"
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
          {w}
        </Box>
      ))}
    </Box>
  );
}
