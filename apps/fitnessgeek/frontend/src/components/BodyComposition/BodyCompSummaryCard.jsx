import React from 'react';
import { Box, Typography } from '@mui/material';
import { FactHeadline, FactRow, StatNumber } from '../primitives';
import { formatInstantDay, formatSpan } from './bodyCompFormat.js';

const fmt = (n, places = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(places) : null);
const withCommas = (n) => Math.round(n).toLocaleString('en-US');

/** A labelled figure in the "more" grid. Renders nothing for a missing value. */
const Figure = ({ label, value, unit, decimals = 1, note }) => {
  if (fmt(value, decimals) === null) return null;
  return (
    // A fact: a hairline above, the name, then the amount. No box.
    <Box sx={{ minWidth: 0, borderTop: (t) => `1px solid ${t.palette.divider}`, pt: 2, pb: 1 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, mb: 0.25 }}>
        {label}
      </Typography>
      <StatNumber value={value} decimals={decimals} unit={unit} size="body" />
      {note && (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.25, lineHeight: 1.4 }}>{note}</Typography>
      )}
    </Box>
  );
};

/**
 * The tidy summary: body fat, muscle, and the calories her body burns at
 * rest, in those words (round-two review: "Skeletal muscle", "Belly fat score
 * (visceral fat)" and "Calories at rest (BMR)" were a lab report). Everything
 * else is `BodyCompMore`, behind "More from your scans".
 *
 * Every figure is the mean of the scans in the 14 days ending at the latest
 * scan (FITNESSGEEK_BODY_DATA_PLAN §0, D7), exactly as the server sent it in
 * `summary.current`. The caption names what the numbers are (how many scans,
 * over which days), because an unlabelled average reads as a measurement.
 *
 * Stored but deliberately NOT shown anywhere (D7): segmental values, protein,
 * bone mass, subcutaneous fat, device.
 */
const BodyCompSummaryCard = ({ summary }) => {
  const current = summary?.current;
  if (!current) return null;

  const span = formatSpan(current.from, current.to);
  const latest = summary.latest_scan_at
    ? formatInstantDay(summary.latest_scan_at)
    : null;
  const muscle = fmt(current.skeletal_muscle_lb, 1);
  const rest = typeof current.bmr_kcal === 'number' && Number.isFinite(current.bmr_kcal) ? withCommas(current.bmr_kcal) : null;

  return (
    <Box sx={{ pt: 0.5 }} data-testid="body-comp-summary">
      <FactHeadline
        name="Body fat"
        value={fmt(current.body_fat_pct, 1) ?? '—'}
        unit="%"
      />
      <Box sx={{ mt: 3 }}>
        {muscle !== null && <FactRow name="Muscle" amount={`${muscle} lb`} />}
        {rest !== null && <FactRow name="Calories your body burns at rest" amount={rest} />}
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.5, mt: 1 }}>
        Average of {current.scans} {current.scans === 1 ? 'scan' : 'scans'} · {span}
        {latest ? ` · latest scan ${latest}` : ''}
      </Typography>
    </Box>
  );
};

/**
 * The rest of the scan, for the person who wants it: why these are averages,
 * the fat and lean split, water, and the scale's belly-fat score.
 */
export const BodyCompMore = ({ summary }) => {
  const current = summary?.current;
  if (!current) return null;
  return (
    <Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, pb: 3 }}>
        A scale like this reads fat through water, so one scan can swing a percent or two
        with how much you drank. Averaging every scan from the last two weeks keeps a
        single day from moving these numbers.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
          columnGap: 4,
          rowGap: 1,
        }}
      >
        <Figure label="Fat" value={current.fat_mass_lb} unit="lb" />
        <Figure label="Lean mass" value={current.lean_mass_lb} unit="lb" note="Everything that isn’t fat" />
        <Figure label="Body water" value={current.body_water_pct} unit="%" />
        <Figure
          label="Belly fat score"
          value={current.visceral_fat_index}
          note="Your scale’s own score; lower is better"
        />
      </Box>
    </Box>
  );
};

export default BodyCompSummaryCard;
