/**
 * The section flags across the top of the column: All · Local · State ·
 * National · World · Tech. Gothic small caps; the current one is ink with a
 * heavy rule under it. Scrolls sideways on a narrow phone.
 */
import React from 'react';
import { Tab, Tabs } from '@mui/material';
import { flagSx } from '../theme/theme';
import { SECTION_TABS } from '../utils/vocab';

export default function SectionTabs({ value = 'all', onChange }) {
  return (
    <Tabs
      value={value}
      onChange={(_, next) => onChange?.(next)}
      variant="scrollable"
      scrollButtons={false}
      aria-label="Sections"
      textColor="inherit"
      sx={{
        minHeight: 44,
        borderBottom: 1,
        borderColor: 'divider',
        '& .MuiTabs-indicator': { height: 3, bgcolor: 'text.primary' },
      }}
    >
      {SECTION_TABS.map((t) => (
        <Tab
          key={t.id}
          value={t.id}
          label={t.label}
          disableRipple
          sx={{
            ...flagSx,
            fontSize: '0.8125rem',
            minHeight: 44,
            minWidth: 0,
            px: 3,
            color: 'text.secondary',
            opacity: 1, // textColor="inherit" fades unselected tabs to 0.6, which is under 4.5:1 in dark
            '&.Mui-selected': { color: 'text.primary' },
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: -4 },
          }}
        />
      ))}
    </Tabs>
  );
}
