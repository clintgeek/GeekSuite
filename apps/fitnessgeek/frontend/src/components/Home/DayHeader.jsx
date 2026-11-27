import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import WbTwilightIcon from '@mui/icons-material/WbTwilight';
import LightModeIcon from '@mui/icons-material/LightMode';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import { friendlyDay } from '../../utils/plainWords.js';

const SKY_ICON = { morning: WbTwilightIcon, midday: LightModeIcon, evening: WbTwilightIcon, night: BedtimeIcon };

// "2026-10-16" → "Friday, October 16", built at local noon so it never slips a day.
const longDay = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

/**
 * The top of Today (DOCS/ONE_APP_PLAN.md §1.1): the day in full words, and
 * on today a one-line greeting; previous and next at the right, and on any
 * other day "Today" to come back.
 *
 * The page's h1 is the greeting on today ("Good morning, Chef") and the day
 * itself on any other ("Yesterday", "Saturday, September 26"). Never
 * truncated: it wraps before it clips.
 *
 * `daylight` (daylight.js) puts a small sun or moon by today's date.
 */
export default function DayHeader({ day, today, greeting, daylight = null, onPrevious, onNext, onToday }) {
  const isToday = day === today;
  const word = friendlyDay(day, today);
  // "Yesterday" gets the date above it; "Saturday, September 26" already is one.
  const eyebrow = isToday || !/\d/.test(word) ? longDay(day) : null;
  const SkyIcon = isToday && daylight ? SKY_ICON[daylight.phase] : null;
  const arrowSx = { width: 44, height: 44, color: 'text.primary' };

  return (
    <Box data-testid="day-header" sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <Typography data-testid="day-header-date" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.9375rem', fontWeight: 500, color: 'text.secondary' }}>
            {SkyIcon && <SkyIcon aria-hidden data-testid={`sky-${daylight.phase}`} sx={{ fontSize: 18, color: daylight.glyph }} />}
            {eyebrow}
          </Typography>
        )}
        <Typography
          component="h1"
          data-testid="day-header-title"
          sx={{ fontSize: { xs: '1.5rem', md: '1.75rem' }, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}
        >
          {isToday ? greeting : word}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {!isToday && (
          <Button
            variant="tonal"
            size="small"
            onClick={onToday}
            aria-label="Back to today"
            data-testid="back-to-today"
            sx={{ minHeight: 44, mr: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Today
          </Button>
        )}
        <IconButton onClick={onPrevious} aria-label="Previous day" sx={arrowSx}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton onClick={onNext} aria-label="Next day" sx={arrowSx}>
          <ChevronRightIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
