/**
 * A section heading struck on Dymo tape — the way a shelf in the garage is
 * labelled. The heading element keeps its role and its words (an <h2> that
 * reads "Overdue", sentence case in the DOM); the tape does the uppercase.
 *
 * `count` rides beside the strip as plain text, so "Overdue · 1" still reads
 * as one heading. `tone`: black by default, red for Overdue, green for done.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import DymoTape from './DymoTape';

export default function SectionTape({ children, id, component = 'h2', tone = 'black', size = 'md', tilt = true, count, sx }) {
  return (
    <Typography
      id={id}
      component={component}
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0, m: 0, fontSize: 'inherit', lineHeight: 1, ...sx }}
    >
      <DymoTape size={size} tone={tone} tilt={tilt} sx={{ minWidth: 0 }}>
        {children}
      </DymoTape>
      {count != null ? (
        <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Box>
      ) : null}
    </Typography>
  );
}
