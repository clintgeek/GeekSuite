/** A source's kind as a small-caps flag. Official carries the spot colour (OfficialBadge); the others are ink. */
import React from 'react';
import { Box } from '@mui/material';
import { flagSx } from '../theme/theme';
import { KIND_LABEL, labelFor } from '../utils/vocab';
import OfficialBadge from './OfficialBadge';

export default function KindBadge({ kind }) {
  if (kind === 'official') return <OfficialBadge />;
  return (
    <Box
      component="span"
      sx={{ ...flagSx, lineHeight: 1.2, display: 'inline-flex', px: 1.5, py: 0.5, color: 'text.secondary', border: 1, borderColor: 'divider', borderRadius: '2px', whiteSpace: 'nowrap' }}
    >
      {labelFor(KIND_LABEL, kind)}
    </Box>
  );
}
