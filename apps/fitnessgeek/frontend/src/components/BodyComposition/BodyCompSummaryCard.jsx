import React, { useId, useState } from 'react';
import { Box, Collapse, IconButton, Typography } from '@mui/material';
import { InfoOutlined as InfoIcon } from '@mui/icons-material';
import { FactHeadline, StatNumber } from '../primitives';
import { formatInstantDay, formatSpan } from './bodyCompFormat.js';

const fmt = (n, places = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(places) : null);

/** A labelled figure in the summary grid. Renders nothing for a missing value. */
const Figure = ({ label, value, unit, decimals = 1, note }) => {
  if (fmt(value, decimals) === null) return null;
  return (
    // A fact: a hairline above, the name, then the amount. No box.
    <Box sx={{ minWidth: 0, borderTop: (t) => `1px solid ${t.palette.text.primary}`, pt: 0.75, pb: 0.5 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, mb: 0.25 }}>
        {label}
      </Typography>
      <StatNumber value={value} decimals={decimals} unit={unit} size="body" />
      {note && (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.25 }}>{note}</Typography>
      )}
    </Box>
  );
};

/**
 * "Now": the mean of the scans in the 14 days ending at the latest scan
 * (FITNESSGEEK_BODY_DATA_PLAN §0, D7), exactly as the server sent it in
 * `summary.current`. The caption names what the numbers are — how many scans,
 * over which days — because an unlabelled average reads as a measurement.
 *
 * Shown: body fat %, fat mass, lean mass, skeletal muscle, body water %,
 * visceral fat index, BMR. Stored but deliberately NOT shown (D7): segmental
 * values, protein, bone mass, subcutaneous fat, device.
 */
const BodyCompSummaryCard = ({ summary }) => {
  const [explain, setExplain] = useState(false);
  const explainId = useId();
  const current = summary?.current;
  if (!current) return null;

  const span = formatSpan(current.from, current.to);
  const latest = summary.latest_scan_at
    ? formatInstantDay(summary.latest_scan_at)
    : null;

  return (
    <Box sx={{ pt: 0.5 }}>
      <FactHeadline
        caption="Now · 14-day average"
        name="Body fat"
        value={fmt(current.body_fat_pct, 1) ?? '—'}
        unit="%"
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.5 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
          Average of {current.scans} {current.scans === 1 ? 'scan' : 'scans'} · {span}
          {latest ? ` · latest scan ${latest}` : ''}
        </Typography>
        <IconButton
          onClick={() => setExplain((v) => !v)}
          aria-expanded={explain}
          aria-controls={explainId}
          aria-label="Why these are averages"
          sx={{ width: 44, height: 44, color: 'text.secondary', mr: -1, flexShrink: 0 }}
        >
          <InfoIcon fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={explain} id={explainId}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, pb: 1 }}>
          A body-composition scale reads fat through water, so one scan can swing a percent or two
          with how much you drank. Averaging every scan from the last two weeks keeps a
          single day from moving these numbers.
        </Typography>
      </Collapse>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
          columnGap: 2,
          rowGap: 0.5,
          mt: 1,
        }}
      >
        <Figure label="Fat mass" value={current.fat_mass_lb} unit="lb" />
        <Figure label="Lean mass" value={current.lean_mass_lb} unit="lb" note="Everything that isn’t fat" />
        <Figure label="Skeletal muscle" value={current.skeletal_muscle_lb} unit="lb" />
        <Figure label="Body water" value={current.body_water_pct} unit="%" />
        <Figure
          label="Belly fat score (visceral fat)"
          value={current.visceral_fat_index}
          note="Your scale’s own scale; lower is better"
        />
        <Figure label="Calories at rest (BMR)" value={current.bmr_kcal} decimals={0} unit="cal" note="From your scale" />
      </Box>
    </Box>
  );
};

export default BodyCompSummaryCard;
