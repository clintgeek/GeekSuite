import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import NetCarbMeter from '../Dashboard/NetCarbMeter.jsx';

/**
 * Full mode's macros, in words: "Protein · 96 of 156 g". Carried over from the
 * old DailyTicket's macro strip (protein / carbs / fat, or fat / protein / net
 * carbs in keto), minus the ALL-CAPS labels and the monospace. Simple mode
 * does not show this (plan: macros stay out of the way).
 *
 * Bars are fills in produce colours, and each carries an accessible name that
 * reads the number — a bare progress bar has none (CONTEXT.md a11y pass).
 */
function MacroBar({ label, current = 0, goal = 0, fill, note, testid }) {
  const theme = useTheme();
  const pct = goal > 0 ? Math.min(1, current / goal) : 0;
  const cur = Math.round(current);
  const tgt = Math.round(goal);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.primary' }}>{label}</Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {cur} of {tgt} g
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={`${label}: ${cur} of ${tgt} grams`}
        sx={{ height: 10, borderRadius: 999, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: 'hidden' }}
      >
        <Box sx={{ width: `${pct * 100}%`, height: '100%', borderRadius: 999, bgcolor: fill }} />
      </Box>
      {note && (
        <Typography data-testid={testid} sx={{ fontSize: '0.9375rem', color: 'text.secondary', mt: 0.5 }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}

export default function MacroStrip({ protein, carbs, fat, mode = 'standard', netCarbsConsumed = 0, netCarbLimit = 20, proteinNote = null }) {
  const theme = useTheme();
  const p = theme.palette.produce || {};
  const bars = mode === 'keto'
    ? [
      { label: 'Fat', ...fat, fill: p.dinner?.fill },
      { label: 'Protein', ...protein, fill: p.lunch?.fill, note: proteinNote, testid: 'macro-note-protein' },
    ]
    : [
      { label: 'Protein', ...protein, fill: p.lunch?.fill, note: proteinNote, testid: 'macro-note-protein' },
      { label: 'Carbs', ...carbs, fill: p.dinner?.fill },
      { label: 'Fat', ...fat, fill: p.breakfast?.fill },
    ];

  return (
    <Box
      data-testid="macro-strip"
      sx={{ display: 'grid', gap: { xs: 1.5, sm: 2.5 }, gridTemplateColumns: { xs: '1fr', sm: `repeat(${mode === 'keto' ? 3 : 3}, minmax(0, 1fr))` } }}
    >
      {bars.map((bar) => (
        <MacroBar key={bar.label} label={bar.label} current={bar.current} goal={bar.goal} fill={bar.fill} note={bar.note} testid={bar.testid} />
      ))}
      {mode === 'keto' && <NetCarbMeter consumed={netCarbsConsumed} limitG={netCarbLimit} />}
    </Box>
  );
}
