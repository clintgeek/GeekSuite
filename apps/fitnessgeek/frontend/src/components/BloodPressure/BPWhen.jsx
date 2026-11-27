import React, { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import DayChoice from '../Weight/DayChoice.jsx';

/**
 * When a blood-pressure reading was taken.
 *
 * Nearly every reading is logged the moment it is taken, so the common case
 * shows no date or time input at all: "Today" is chosen and the line under it
 * says "Taken just now" (round-two review: two raw browser inputs sat in the
 * middle of the form). "Yesterday" and "Another day" are a tap, and the
 * native time field appears when the day is not today, when the person asks
 * for it, or when the form already carries a time of its own (an edit).
 *
 * The parent remounts this (a `key`) when it re-seeds its form.
 *
 * @param {{ date: string, time: string, today: string,
 *   onDate: (ymd: string) => void, onTime: (hhmm: string) => void,
 *   timeOpen?: boolean }} props `timeOpen` shows the time field from the start.
 */
const BPWhen = ({ date, time, today, onDate, onTime, timeOpen = false }) => {
  const [asked, setAsked] = useState(false);
  const showTime = timeOpen || asked || date !== today;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <DayChoice value={date} onChange={onDate} today={today} label="Which day" />
      {showTime ? (
        <TextField
          fullWidth
          label="Time"
          type="time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          size="medium"
          InputLabelProps={{ shrink: true }}
          inputProps={{ step: 60 }}
        />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>Taken just now</Typography>
          <Button
            variant="text"
            onClick={() => setAsked(true)}
            sx={{ minHeight: 44, px: 0, fontWeight: 600, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
          >
            Change the time
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default BPWhen;
