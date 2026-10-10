/**
 * "2h ago", with the absolute Chicago time on hover, focus and long-press
 * (the Tooltip opens on a 600ms touch). With describeChild, MUI also puts it
 * in the <time> element's native title while the tooltip is closed.
 */
import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { absoluteTime, relativeTime } from '../utils/dates';

export default function TimeAgo({ value, prefix = '', sx }) {
  if (!value) return null;
  const absolute = absoluteTime(value);
  const iso = new Date(value).toISOString();
  return (
    <Tooltip title={absolute} enterTouchDelay={600} leaveTouchDelay={2500} describeChild>
      <Box component="time" dateTime={iso} tabIndex={0} sx={{ whiteSpace: 'nowrap', '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 }, ...sx }}>
        {prefix}
        {relativeTime(value)}
      </Box>
    </Tooltip>
  );
}
