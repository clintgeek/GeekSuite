/**
 * A section heading the Moving Day way: heavy slab words, led by a short
 * cluster of orange speed stripes (or, for status sections, a marker light).
 * The heading element keeps its role and its words — an <h2> that reads
 * "Overdue" — and `count` rides beside it as plain text.
 *
 * `tone`: 'livery' (stripes, the default), 'overdue' (a red marker light),
 * 'soon' (amber), 'done' (a black check on orange).
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { DISPLAY_FONT, LIVERY, MARKER } from '../theme/theme';

export function StripeMark({ sx }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid="stripe-mark"
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: 26,
        height: 14,
        // Three forward-leaning bars: the flank of the truck, in miniature.
        backgroundImage: `linear-gradient(115deg, transparent 0 18%, ${LIVERY.orange} 18% 44%, transparent 44% 52%, ${LIVERY.burnt} 52% 66%, transparent 66% 74%, ${LIVERY.orange} 74% 84%, transparent 84%)`,
        ...sx,
      }}
    />
  );
}

export function MarkerLight({ tone = 'overdue', lit = true, size = 14, sx, testId }) {
  const fill = tone === 'soon' ? MARKER.soon : MARKER.overdue;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid={testId}
      data-tone={tone}
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: lit ? fill : 'transparent',
        border: '2px solid',
        borderColor: MARKER.ring,
        boxShadow: lit ? `0 0 0 2px rgba(255,255,255,0.0), 0 0 8px ${fill}` : 'none',
        ...sx,
      }}
    />
  );
}

export default function SectionHeading({ children, id, component = 'h2', tone = 'livery', size = 'md', count, sx }) {
  const fontSize = size === 'lg' ? { xs: '1.375rem', md: '1.5rem' } : '1.125rem';
  let mark = <StripeMark />;
  if (tone === 'overdue' || tone === 'soon') mark = <MarkerLight tone={tone} />;
  if (tone === 'done')
    mark = (
      <Box component="span" aria-hidden="true" sx={{ width: 18, height: 18, borderRadius: '3px', bgcolor: LIVERY.orange, color: LIVERY.ink, display: 'grid', placeItems: 'center', fontSize: '0.8125rem', fontWeight: 900, flexShrink: 0, border: `1.5px solid ${LIVERY.ink}` }}>
        ✓
      </Box>
    );
  return (
    <Typography
      id={id}
      component={component}
      data-testid="section-heading"
      data-tone={tone}
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0, m: 0, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize, lineHeight: 1.2, color: 'text.primary', ...sx }}
    >
      {mark}
      <Box component="span" sx={{ minWidth: 0 }}>
        {children}
      </Box>
      {count != null ? (
        <Box component="span" sx={{ fontFamily: 'inherit', fontSize: '0.9375rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Box>
      ) : null}
    </Typography>
  );
}
