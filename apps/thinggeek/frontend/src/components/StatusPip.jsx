/**
 * A status, not a to-do: a small round dial that fills orange with how much
 * is on file, and turns into an orange check plate when all of it is. Round
 * on purpose — the square box (OnboardingChecklist's CheckSquare) means "a
 * step you tick", and a status that looks tickable invites a tap that does
 * nothing (2026-11-18 review). Decorative: the words beside it say the number.
 */
import React from 'react';
import { Box } from '@mui/material';
import { LIVERY } from '../theme/theme';

export default function StatusPip({ fraction = null, done = false, sx }) {
  const pct = done ? 100 : Math.round(100 * Math.max(0, Math.min(1, fraction ?? 0)));
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid="status-pip"
      data-done={done ? 'true' : 'false'}
      data-percent={pct}
      sx={{
        width: 20,
        height: 20,
        flexShrink: 0,
        borderRadius: '50%',
        border: '2px solid',
        borderColor: done ? LIVERY.ink : 'text.primary',
        display: 'grid',
        placeItems: 'center',
        fontSize: '0.75rem',
        fontWeight: 900,
        lineHeight: 1,
        color: LIVERY.ink,
        bgcolor: done ? LIVERY.orange : 'transparent',
        backgroundImage: done ? 'none' : `conic-gradient(${LIVERY.orange} 0 ${pct}%, transparent ${pct}% 100%)`,
        ...sx,
      }}
    >
      {done ? '✓' : ''}
    </Box>
  );
}
