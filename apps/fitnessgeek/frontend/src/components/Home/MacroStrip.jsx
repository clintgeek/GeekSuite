import React from 'react';
import { Box } from '@mui/material';
import { FactColumnHead, FactRow } from '../primitives';
import NetCarbMeter from '../Dashboard/NetCarbMeter.jsx';

/**
 * Full mode's "% of daily target" rows, drawn as a Nutrition Facts label
 * (THEME_REVIEW_2026-11): **Protein** 113 g of 156 ……… 72%. Over target says
 * so in words, in an inverse tag — "Fat 99 g of 78 [21 OVER] 127%" — so no
 * colour carries "over" alone (review D-14). Protein / carbs / fat, or fat /
 * protein / net carbs in keto. Simple mode does not show this (plan: macros
 * stay out of the way).
 *
 * `calories` ({ current, goal }) adds the "Eaten 1,680 cal" row first, the
 * calories' own share of the target.
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const percentOf = (cur, goal) => (goal > 0 ? `${Math.round((cur / goal) * 100)}%` : '—');

function MacroRow({ label, current = 0, goal = 0, unit = 'g', note, testid, first }) {
  const cur = Math.round(current);
  const tgt = Math.round(goal);
  const over = tgt > 0 && cur > tgt ? cur - tgt : 0;
  return (
    <FactRow
      first={first}
      name={label}
      amount={`${fmt(cur)} ${unit}`}
      of={tgt > 0 || note ? (
        <>
          {tgt > 0 ? `of ${fmt(tgt)}` : null}
          {note && <span data-testid={testid}>{tgt > 0 ? ' · ' : ''}{note}</span>}
        </>
      ) : null}
      tag={over > 0 ? `${fmt(over)} over` : null}
      percent={percentOf(cur, tgt)}
    />
  );
}

export default function MacroStrip({ protein, carbs, fat, calories = null, mode = 'standard', netCarbsConsumed = 0, netCarbLimit = 20, proteinNote = null, head = true }) {
  const rows = mode === 'keto'
    ? [
      { label: 'Fat', ...fat },
      { label: 'Protein', ...protein, note: proteinNote, testid: 'macro-note-protein' },
    ]
    : [
      { label: 'Protein', ...protein, note: proteinNote, testid: 'macro-note-protein' },
      { label: 'Carbs', ...carbs },
      { label: 'Fat', ...fat },
    ];

  return (
    <Box data-testid="macro-strip">
      {head && <FactColumnHead>% of daily target</FactColumnHead>}
      {calories && (
        <FactRow
          name="Eaten"
          amount={`${fmt(calories.current)} cal`}
          tag={calories.goal > 0 && calories.current > calories.goal ? `${fmt(calories.current - calories.goal)} over` : null}
          percent={percentOf(Math.round(calories.current || 0), Math.round(calories.goal || 0))}
        />
      )}
      {rows.map((row) => (
        <MacroRow key={row.label} label={row.label} current={row.current} goal={row.goal} note={row.note} testid={row.testid} />
      ))}
      {mode === 'keto' && <NetCarbMeter consumed={netCarbsConsumed} limitG={netCarbLimit} />}
    </Box>
  );
}
