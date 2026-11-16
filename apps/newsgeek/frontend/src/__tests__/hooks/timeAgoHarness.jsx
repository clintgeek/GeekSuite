import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import TimeAgo from '../../components/TimeAgo';
import { createNewsTheme } from '../../theme/theme';

/** TimeAgo under the app theme, nothing else. */
export function TimeAgoTick({ value }) {
  return (
    <ThemeProvider theme={createNewsTheme('light')}>
      <TimeAgo value={value} />
    </ThemeProvider>
  );
}
