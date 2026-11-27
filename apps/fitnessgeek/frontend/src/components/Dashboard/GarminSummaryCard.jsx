import React from 'react';
import { Typography } from '@mui/material';
import { clockTime, shortDay } from '../../utils/dates.js';
import { LabelPanel, FactRow } from '../primitives';

/**
 * The day's Garmin numbers as a level-2 label panel (The Label): one fact
 * row each — resting heart rate, steps, calories from activity, sleep — and
 * when they were fetched, in the foot. No tiles inside the panel.
 *
 * `timeout` is accepted for compatibility (it was the old fade-in).
 */
const GarminSummaryCard = ({ steps, activeCalories, sleepMinutes, restingHR, fetchedAt, lastSyncAt, title = 'Today’s activity' }) => {
  const sleepText = sleepMinutes != null ? `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m` : '—';
  const timeText = fetchedAt ? clockTime(fetchedAt) : '';
  const rows = [
    { name: 'Resting heart rate', value: restingHR != null ? `${restingHR} bpm` : '—' },
    { name: 'Steps', value: steps != null ? Number(steps).toLocaleString('en-US') : '—' },
    { name: 'From activity', value: activeCalories != null ? `${activeCalories} cal` : '—' },
    { name: 'Sleep', value: sleepText },
  ];
  return (
    <LabelPanel title={title}>
      {rows.map((row, i) => (
        <FactRow key={row.name} first={i === 0} name={row.name} trailing={row.value} />
      ))}
      {(timeText || lastSyncAt) && (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', pt: 0.75, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
          {timeText && <>Updated {timeText}</>}
          {timeText && lastSyncAt && ' · '}
          {lastSyncAt && <>Last synced {shortDay(lastSyncAt)}</>}
        </Typography>
      )}
    </LabelPanel>
  );
};

export default GarminSummaryCard;
