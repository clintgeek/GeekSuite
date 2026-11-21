/**
 * A small picture of a day's ink page: the strokes as SVG polylines, in the
 * text colour, on the page's own paper. No tldraw (see inkThumb.js).
 */
import React from 'react';
import { Box } from '@mui/material';
import { THUMB_PAGE_HEIGHT, THUMB_PAGE_WIDTH } from './inkThumb.js';

export default function InkThumb({ thumb }) {
  if (!thumb?.paths?.length) return null;
  return (
    <Box
      component="svg"
      aria-hidden
      focusable="false"
      data-testid="week-ink-thumb"
      viewBox={`0 ${thumb.top || 0} ${THUMB_PAGE_WIDTH} ${THUMB_PAGE_HEIGHT}`}
      preserveAspectRatio="xMidYMin slice"
      sx={{ display: 'block', width: '100%', height: '100%', color: 'text.primary' }}
    >
      {thumb.paths.map((d, i) => (
        <path
          // Strokes have no identity here and never reorder.
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          // A hairline at any thumbnail size, instead of 3 page units scaled down to nothing.
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </Box>
  );
}
