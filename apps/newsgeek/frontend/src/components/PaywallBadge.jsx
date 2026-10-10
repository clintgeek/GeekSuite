/**
 * PAYWALL / METERED: a source that wants a subscription. Ink on the page with
 * a lock, set in small capitals — a word and a mark, never just a colour, and
 * never the spot blue (that is OFFICIAL's alone). Renders nothing for a free
 * source.
 */
import React from 'react';
import { Box } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { flagSx } from '../theme/theme';

const LABEL = { hard: 'Paywall', metered: 'Metered' };

export default function PaywallBadge({ source, sx }) {
  const level = source?.access?.paywall;
  if (!source?.paywalled || !LABEL[level]) return null;
  return (
    <Box
      component="span"
      data-testid="paywall-badge"
      title={level === 'hard' ? 'Needs a subscription' : 'A few free stories, then a subscription'}
      sx={{
        ...flagSx,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        lineHeight: 1.2,
        color: 'text.primary',
        border: 1,
        borderStyle: level === 'hard' ? 'solid' : 'dashed',
        borderColor: 'text.primary',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      <LockOutlined aria-hidden="true" sx={{ fontSize: 14 }} />
      {LABEL[level]}
    </Box>
  );
}
