import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon
} from '@mui/icons-material';

/**
 * The day, drawn as a plain header on the grey ground (not a card): previous
 * and next arrows around a heavy "Today" (or the date in words), with the
 * date as a small-caps eyebrow under it when the title is a word.
 */
const eyebrowFor = (selectedDate) => {
  const [y, m, d] = String(selectedDate || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const DateNavigator = ({
  selectedDate,
  onPreviousDay,
  onNextDay,
  formatDate,
  calorieCard = null,
  ...props
}) => {
  // The day in words, never truncated: it wraps before it clips.
  const displayDate = React.useMemo(() => {
    if (typeof formatDate === 'function') {
      return formatDate(selectedDate);
    }
    return selectedDate;
  }, [selectedDate, formatDate]);
  // "Today" / "Yesterday" get the date beneath; "Saturday, September 26" already is one.
  const eyebrow = /\d/.test(String(displayDate)) ? null : eyebrowFor(selectedDate);

  return (
    <Box {...props} sx={{ ...props.sx }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 48px',
        alignItems: 'center',
      }}>
        <IconButton
          onClick={onPreviousDay}
          aria-label="Previous day"
          sx={{ width: 48, height: 48, color: 'text.primary' }}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.125, justifySelf: 'center', minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{
              m: 0,
              fontWeight: 900,
              lineHeight: 1.1,
              fontSize: { xs: '1.5rem', sm: '1.75rem' },
              textAlign: 'center'
            }}
          >
            {displayDate}
          </Typography>
          {eyebrow && (
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
              {eyebrow}
            </Typography>
          )}
        </Box>

        <IconButton
          onClick={onNextDay}
          aria-label="Next day"
          sx={{ width: 48, height: 48, color: 'text.primary' }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>
      {calorieCard}
    </Box>
  );
};

export default DateNavigator;
