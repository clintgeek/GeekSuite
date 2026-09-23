import React, { useId, useState } from 'react';
import { Box, Collapse, IconButton, Typography } from '@mui/material';
import { InfoOutlined as InfoIcon } from '@mui/icons-material';
import { Surface, SectionLabel, StatNumber } from '../primitives';
import { formatInstantDay, formatSpan } from './bodyCompFormat.js';

const fmt = (n, places = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(places) : null);

/** A labelled figure in the summary grid. Renders nothing for a missing value. */
const Figure = ({ label, value, unit, decimals = 1, note }) => {
  if (fmt(value, decimals) === null) return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>
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
    <Surface>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0, pt: 0.5 }}>
          <SectionLabel sx={{ mb: 1.25 }}>Now · 14-day average</SectionLabel>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <StatNumber value={current.body_fat_pct} decimals={1} unit="% body fat" size="display" />
          </Box>
        </Box>
        <IconButton
          onClick={() => setExplain((v) => !v)}
          aria-expanded={explain}
          aria-controls={explainId}
          aria-label="Why these are averages"
          sx={{ width: 44, height: 44, color: 'text.secondary', mt: -0.75, mr: -0.75, flexShrink: 0 }}
        >
          <InfoIcon fontSize="small" />
        </IconButton>
      </Box>

      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 1 }}>
        Average of {current.scans} {current.scans === 1 ? 'scan' : 'scans'} · {span}
        {latest ? ` · latest scan ${latest}` : ''}
      </Typography>

      <Collapse in={explain} id={explainId}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.55, mt: 1.5 }}>
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
          rowGap: 2,
          mt: 2.5,
          pt: 2,
          borderTop: (t) => `1px dashed ${t.palette.divider}`,
        }}
      >
        <Figure label="Fat mass" value={current.fat_mass_lb} unit="lb" />
        <Figure label="Lean mass" value={current.lean_mass_lb} unit="lb" />
        <Figure label="Skeletal muscle" value={current.skeletal_muscle_lb} unit="lb" />
        <Figure label="Body water" value={current.body_water_pct} unit="%" />
        <Figure label="Visceral fat index" value={current.visceral_fat_index} />
        <Figure label="BMR (scale)" value={current.bmr_kcal} decimals={0} unit="kcal" />
      </Box>
    </Surface>
  );
};

export default BodyCompSummaryCard;
