import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FactColumnHead, FactRow, LabelBar } from '../primitives';
import NetCarbMeter from '../Dashboard/NetCarbMeter.jsx';
import { macroColors } from '../../theme/theme.jsx';

/**
 * Full mode's budget rows: for each of calories, protein, carbs and fat, a
 * line of words — **Protein** 113 g of 156 ……… 72% — over a thin bar in that
 * macro's own colour. Over target says so in words, in a tag ("Fat 99 g of 78
 * [21 over] 127%"), so no colour carries "over" alone (review D-14). Protein
 * / carbs / fat, or fat / protein / net carbs in keto. Simple mode does not
 * show this (plan: macros stay out of the way).
 *
 * `calories` ({ current, goal }) adds the "Eaten 1,680 cal" row first, in the
 * app's blue. `head` adds the "% of daily target" column heading.
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const percentOf = (cur, goal) => (goal > 0 ? `${Math.round((cur / goal) * 100)}%` : '—');
const barValue = (cur, goal) => (goal > 0 ? Math.min(100, (cur / goal) * 100) : 0);

function BudgetRow({ label, current = 0, goal = 0, unit = 'g', note, testid, color }) {
  const cur = Math.round(current);
  const tgt = Math.round(goal);
  const over = tgt > 0 && cur > tgt ? cur - tgt : 0;
  return (
    <Box>
      <FactRow
        first
        sx={{ py: 0, pb: 0.5 }}
        name={label}
        amount={`${fmt(cur)} ${unit}`}
        of={unit === 'g' && (tgt > 0 || note) ? (
          <>
            {tgt > 0 ? `of ${fmt(tgt)}` : null}
            {note && <span data-testid={testid}>{tgt > 0 ? ' · ' : ''}{note}</span>}
          </>
        ) : null}
        tag={over > 0 ? `${fmt(over)} over` : null}
        tagTone="warning"
        percent={percentOf(cur, tgt)}
      />
      <LabelBar
        segments={[{ value: barValue(cur, tgt), color }]}
        label={tgt > 0 ? `${label}: ${fmt(cur)} of ${fmt(tgt)} ${unit}` : `${label}: ${fmt(cur)} ${unit}`}
        height={6}
        sx={{ my: 0, mt: 1 }}
      />
    </Box>
  );
}

export default function MacroStrip({ protein, carbs, fat, calories = null, mode = 'standard', netCarbsConsumed = 0, netCarbLimit = 20, proteinNote = null, head = true }) {
  const theme = useTheme();
  const colours = macroColors(theme.palette.mode);
  const rows = mode === 'keto'
    ? [
      { label: 'Fat', ...fat, color: colours.fat },
      { label: 'Protein', ...protein, note: proteinNote, testid: 'macro-note-protein', color: colours.protein },
    ]
    : [
      { label: 'Protein', ...protein, note: proteinNote, testid: 'macro-note-protein', color: colours.protein },
      { label: 'Carbs', ...carbs, color: colours.carbs },
      { label: 'Fat', ...fat, color: colours.fat },
    ];

  return (
    <Box data-testid="macro-strip" sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {head && <FactColumnHead>% of daily target</FactColumnHead>}
      {calories && (
        <BudgetRow label="Eaten" current={calories.current} goal={calories.goal} unit="cal" color={theme.palette.primary.main} />
      )}
      {rows.map((row) => (
        <BudgetRow key={row.label} label={row.label} current={row.current} goal={row.goal} note={row.note} testid={row.testid} color={row.color} />
      ))}
      {mode === 'keto' && <NetCarbMeter consumed={netCarbsConsumed} limitG={netCarbLimit} />}
    </Box>
  );
}
