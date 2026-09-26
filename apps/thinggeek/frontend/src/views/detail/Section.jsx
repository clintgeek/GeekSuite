/** A titled block of the detail sheet: a small-caps heading, an optional action, the body. */
import React from 'react';
import { Box, Typography } from '@mui/material';

export default function Section({ title, action, children, id, sx }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      data-section={id}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', p: 2, minWidth: 0, scrollMarginTop: 72, ...sx }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1, minHeight: 32 }}>
        <Typography
          id={headingId}
          component="h3"
          sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
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
