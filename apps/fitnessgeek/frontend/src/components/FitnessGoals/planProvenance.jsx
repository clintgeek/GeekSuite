import React from 'react';
import { Box, Typography } from '@mui/material';
import { macroRules, macrosForCalories } from '@geeksuite/utils';

/**
 * Where a plan's BMR came from, and what a saved plan changes to.
 * DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D1 (name the source) and D2 (a large
 * change to the number you eat to is shown, never slipped in).
 */

const fmt = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('en-US') : '—');
const fmtLb = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
};

/** One sentence naming the BMR formula a plan used. */
export function bmrSourceText({ source, leanMassLb, scans }) {
  if (source === 'scan') {
    const lean = fmtLb(leanMassLb);
    const over = Number(scans) > 1 ? `, averaged over ${scans} scans` : Number(scans) === 1 ? ', from 1 scan' : '';
    return `Measured — from your body scans: ${lean ?? '?'} lb lean mass${over} (Katch-McArdle).`;
  }
  return 'Estimated from weight, height, age and sex (Mifflin-St Jeor). A body scan gives a measured figure.';
}

export function BmrSourceNote({ source, leanMassLb, scans, scanLoadFailed = false }) {
  return (
    <Typography
      variant="caption"
      data-testid="bmr-source"
      data-source={source === 'scan' ? 'scan' : 'mifflin'}
      sx={{ color: 'text.secondary', display: 'block' }}
    >
      {bmrSourceText({ source, leanMassLb, scans })}
      {source !== 'scan' && scanLoadFailed ? " Your body scans couldn't be loaded just now." : ''}
    </Typography>
  );
}

const weeklyAverage = (schedule) => {
  const nums = (schedule || []).map((d) => Number(d?.calories ?? d)).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length !== 7) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / 7);
};
const isUniform = (schedule) => {
  const nums = (schedule || []).map((d) => Number(d?.calories ?? d));
  return nums.length !== 7 || nums.every((n) => n === nums[0]);
};

const Row = ({ label, before, after, unit = 'kcal' }) => {
  const delta = Number.isFinite(Number(before)) && Number.isFinite(Number(after)) ? Math.round(after - before) : null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'baseline', py: 0.5 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', color: 'text.primary', textAlign: 'right' }}>
        {fmt(before)} → <Box component="strong" sx={{ fontWeight: 700 }}>{fmt(after)}</Box> {unit}
        {delta !== null && delta !== 0 && (
          <Box component="span" sx={{ color: 'text.secondary' }}> ({delta > 0 ? '+' : '−'}{fmt(Math.abs(delta))})</Box>
        )}
      </Typography>
    </Box>
  );
};

/**
 * Saved plan next to the one about to replace it.
 *
 * @param {Object} saved  { dailyCalories, bmr, schedule, stale }
 * @param {Object} next   the freshly computed plan ({ dailyCalories, bmr, schedule })
 */
export function PlanComparison({ saved, next }) {
  if (!saved || !next || !(Number(saved.dailyCalories) > 0)) return null;
  const showAverage = !isUniform(saved.schedule) || !isUniform(next.schedule);
  return (
    <Box
      data-testid="plan-comparison"
      sx={{ mb: 3, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
        Your saved plan → this plan
      </Typography>
      <Row label="Daily target" before={saved.dailyCalories} after={next.dailyCalories} />
      {showAverage && (
        <Row label="Weekly average per day" before={weeklyAverage(saved.schedule)} after={weeklyAverage(next.schedule)} />
      )}
      <Row label="BMR" before={saved.bmr} after={next.bmr} />
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
        {saved.stale
          ? 'Your saved plan was calculated with a formula error fixed on 20 Sep. Nothing changes until you save.'
          : 'Nothing changes until you save.'}
      </Typography>
    </Box>
  );
}

/**
 * The grams `derivedMacros` will serve for `calories` once `ngDraft` is saved.
 * Same two functions the gateway calls (plan D5), so the preview cannot
 * disagree with the dashboard.
 */
export function previewMacros(ngDraft, { leanMassLb = null, calories } = {}) {
  const rules = macroRules(ngDraft, { leanMassLb });
  return { rules, grams: macrosForCalories(calories, rules) };
}

/** One short line when protein is set from lean mass; nothing otherwise. */
export function ProteinBasisNote({ rules }) {
  if (rules?.protein_basis !== 'lean_mass') return null;
  const per = Number(rules.protein_g_per_lb_lean);
  return (
    <Typography variant="caption" data-testid="protein-basis" sx={{ color: 'text.secondary', display: 'block' }}>
      Protein is set from your lean mass: {fmtLb(per) ?? per} g per lb × {fmtLb(rules.lean_mass_lb)} lb.
    </Typography>
  );
}
