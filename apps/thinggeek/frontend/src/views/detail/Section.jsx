/**
 * A titled block of a thing's page: a card-stock sheet with a sentence-case
 * heading (uppercase belongs to the tape alone), an optional action, the
 * body. `title` may be a node — Contains puts the place's tape in it.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { DISPLAY_FONT } from '../../theme/theme';

export const SECTION_TITLE_SX = { fontFamily: DISPLAY_FONT, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.25, color: 'text.primary' };

export default function Section({ title, action, children, id, sx }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      data-section={id}
      sx={{ border: 1, borderColor: 'border', borderRadius: '6px', bgcolor: 'background.paper', p: 2, minWidth: 0, scrollMarginTop: 72, boxShadow: '0 1px 3px rgba(40, 25, 10, 0.10)', ...sx }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1, minHeight: 32 }}>
        <Typography id={headingId} component="h2" sx={{ ...SECTION_TITLE_SX, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

/**
 * One ruled ledger line: label on the left, value on the right (stacked on
 * a narrow phone when the value is long). `children` is the value.
 */
export function LedgerRow({ label, children, action, testId }) {
  return (
    <Box
      component="div"
      role="group"
      aria-label={label}
      data-testid={testId}
      sx={{
        display: 'grid',
        gridTemplateColumns: action ? 'minmax(96px, 38%) minmax(0, 1fr) auto' : 'minmax(96px, 38%) minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 1.5,
        minHeight: 44,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.35 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, fontSize: '0.9375rem', color: 'text.primary', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{children}</Box>
      {action ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mr: -1 }}>{action}</Box> : null}
    </Box>
  );
}
