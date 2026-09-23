import React from 'react';
import { Box, Typography } from '@mui/material';
import { Surface, SectionLabel, StatNumber } from '../primitives';
import { describeChange, formatDay, formatSpan } from './bodyCompFormat.js';

/** One signed delta. Neutral ink on purpose: a change is information, not a grade. */
const Delta = ({ label, value }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>
      {label}
    </Typography>
    {typeof value === 'number' ? (
      <StatNumber
        value={Math.abs(Math.round(value * 10) / 10)}
        decimals={1}
        prefix={Math.round(value * 10) === 0 ? '' : value < 0 ? '\u2212' : '+'}
        unit="lb"
        size="body"
      />
    ) : (
      <StatNumber value="—" size="body" />
    )}
  </Box>
);

/**
 * The change: 7-day mean vs 7-day mean, window centres ≥ 14 days apart
 * (FITNESSGEEK_BODY_DATA_PLAN §0). Every number is the server's
 * `summary.change`; this card never subtracts anything.
 *
 * Before the comparison exists it says WHEN it will ("around 4 Oct") and why,
 * never a number — a scan-over-scan delta is the water-weight story the rule
 * exists to keep off the screen.
 */
const BodyCompChangeCard = ({ summary }) => {
  const change = summary?.change;
  if (!change) return null;

  if (!change.available) {
    const when = change.available_from ? formatDay(change.available_from) : null;
    return (
      <Surface>
        <SectionLabel sx={{ mb: 1.25 }}>Change</SectionLabel>
        <Typography sx={{ color: 'text.primary', fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>
          {when
            ? `Your first comparison appears around ${when}.`
            : 'Your first comparison appears after two weeks of scans.'}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.75, lineHeight: 1.5 }}>
          It compares one week&rsquo;s average with another&rsquo;s two weeks later — close enough
          together and the difference is mostly water.
        </Typography>
      </Surface>
    );
  }

  const reading = describeChange(change);
  const baseline = formatSpan(change.baseline?.from, change.baseline?.to);
  const latest = formatSpan(change.latest?.from, change.latest?.to);

  return (
    <Surface>
      <SectionLabel sx={{ mb: 1.25 }}>Change</SectionLabel>
      {reading && (
        <Typography sx={{ color: 'text.primary', fontSize: '1rem', fontWeight: 600, lineHeight: 1.45 }}>
          {reading}
        </Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          columnGap: 2,
          mt: 2,
        }}
      >
        <Delta label="Fat" value={change.fat_change_lb} />
        <Delta label="Lean" value={change.lean_change_lb} />
        <Delta label="Weight" value={change.weight_change_lb} />
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 2, lineHeight: 1.5 }}>
        Average of {baseline} ({change.baseline?.scans} {change.baseline?.scans === 1 ? 'scan' : 'scans'})
        {' '}against {latest} ({change.latest?.scans} {change.latest?.scans === 1 ? 'scan' : 'scans'}).
      </Typography>
    </Surface>
  );
};

export default BodyCompChangeCard;
