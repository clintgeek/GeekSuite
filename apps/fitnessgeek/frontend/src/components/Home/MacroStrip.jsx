import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NetCarbMeter from '../Dashboard/NetCarbMeter.jsx';
import { macroColors, trackColor } from '../../theme/theme.jsx';

/**
 * Full mode's macros, in words: "Protein · 96 of 156g". Over target says so
 * in words — "99 of 78g · 21 over" — so the full bar's colour isn't carrying
 * "over" alone (review D-14; no colour without words). Carried over from the
 * old DailyTicket's macro strip (protein / carbs / fat, or fat / protein / net
 * carbs in keto), minus the ALL-CAPS labels and the monospace. Simple mode
 * does not show this (plan: macros stay out of the way).
 *
 * Bars are fills in the macro ramp (basil, cinnamon, the muted ink), not the
 * produce: the plate ring just above uses the produce for meals, and "Fat"
 * in tomato read as Breakfast (visual review B2). Each bar carries an
 * accessible name that reads the number — a bare progress bar has none
 * (CONTEXT.md a11y pass).
 */
function MacroBar({ label, current = 0, goal = 0, fill, note, testid }) {
  const theme = useTheme();
  const pct = goal > 0 ? Math.min(1, current / goal) : 0;
  const cur = Math.round(current);
  const tgt = Math.round(goal);
  const over = tgt > 0 && cur > tgt ? cur - tgt : 0;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.primary' }}>{label}</Typography>
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {cur} of {tgt}g{over > 0 ? ` · ${over} over` : ''}
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={`${label}: ${cur} of ${tgt} grams${over > 0 ? `, ${over} over` : ''}`}
        sx={{ height: 10, borderRadius: 999, bgcolor: trackColor(theme), overflow: 'hidden' }}
      >
        <Box data-testid={`macro-fill-${label.toLowerCase()}`} sx={{ width: `${pct * 100}%`, height: '100%', borderRadius: 999, bgcolor: fill }} />
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
  const m = theme.palette.macro || macroColors(theme.palette.mode);
  const bars = mode === 'keto'
    ? [
      { label: 'Fat', ...fat, fill: m.fat },
      { label: 'Protein', ...protein, fill: m.protein, note: proteinNote, testid: 'macro-note-protein' },
    ]
    : [
      { label: 'Protein', ...protein, fill: m.protein, note: proteinNote, testid: 'macro-note-protein' },
      { label: 'Carbs', ...carbs, fill: m.carbs },
      { label: 'Fat', ...fat, fill: m.fat },
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
