import React, { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { localDateString } from '@geeksuite/utils';
import DateField from '../primitives/DateField.jsx';

/** The calendar day before `ymd` (`YYYY-MM-DD`), on the device's calendar. */
export function dayBefore(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return localDateString(new Date(y, m - 1, d - 1, 12));
}

/**
 * Which day? "Today", "Yesterday", or "Another day".
 *
 * A weigh-in or a blood-pressure reading is for today nearly every time and
 * for yesterday most of the rest, so those are one tap each and the common
 * case never shows a date input at all (round-two review: the raw native
 * date field read as a browser default). "Another day" reveals the native
 * picker, which stays because it is the reliable one on phones.
 *
 * Values in and out are `YYYY-MM-DD` strings, like DateField's. A value that
 * is neither today nor yesterday (an edit of an older reading) opens with
 * the date field showing.
 *
 * The parent remounts this (a `key`) when its form is re-seeded, so "Another
 * day" does not stay open across two uses of a dialog.
 */
const DayChoice = ({ value, onChange, today = localDateString(), label = 'Day', size = 'medium', sx }) => {
  const yesterday = dayBefore(today);
  const [other, setOther] = useState(() => Boolean(value) && value !== today && value !== yesterday);
  const choice = other ? 'other' : value === yesterday ? 'yesterday' : 'today';

  const pick = (_e, next) => {
    if (!next) return; // a tap on the chosen one keeps it
    if (next === 'other') {
      setOther(true);
      return;
    }
    setOther(false);
    onChange(next === 'today' ? today : yesterday);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, ...sx }}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={choice}
        onChange={pick}
        aria-label={label}
        data-testid="day-choice"
        sx={{
          '& .MuiToggleButton-root': {
            flex: '1 1 0',
            minWidth: 0,
            minHeight: 44,
            px: 1,
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
          },
        }}
      >
        <ToggleButton value="today">Today</ToggleButton>
        <ToggleButton value="yesterday">Yesterday</ToggleButton>
        <ToggleButton value="other">Another day</ToggleButton>
      </ToggleButtonGroup>
      {other && (
        <DateField
          fullWidth
          size={size}
          value={value}
          onChange={onChange}
          max={today}
          sx={{ minWidth: 0 }}
        />
      )}
    </Box>
  );
};

export default DayChoice;
