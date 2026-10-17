import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { macroRules, macrosForCalories } from '@geeksuite/utils';
import { MEASURED_ACTIVITY } from './planMath.js';

/**
 * Where a plan's BMR came from, and what a saved plan changes to.
 * DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D1 (name the source) and D2 (a large
 * change to the number you eat to is shown, never slipped in).
 */

// The activity levels in words, for the TDEE line ("sedentary" was shown raw).
const ACTIVITY_WORDS = {
  sedentary: 'little or no exercise',
  light: 'light exercise 1–3 days a week',
  moderate: 'exercise 3–5 days a week',
  very: 'hard exercise 6–7 days a week',
  extra: 'very hard exercise or a physical job',
};

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
      {source !== 'scan' && scanLoadFailed ? ' Your body scans couldn’t be loaded just now.' : ''}
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

const Row = ({ label, before, after, unit = 'cal' }) => {
  const delta = Number.isFinite(Number(before)) && Number.isFinite(Number(after)) ? Math.round(after - before) : null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'baseline', py: 0.5 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: "inherit", fontVariantNumeric: 'tabular-nums', color: 'text.primary', textAlign: 'right' }}>
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
      <Row label="Calories at rest (BMR)" before={saved.bmr} after={next.bmr} />
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
        {saved.stale
          ? 'Your saved plan was calculated with a formula error fixed on Sep 20. Nothing changes until you save.'
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

/**
 * "Your Metabolism": the BMR and TDEE a plan was built on. The full wizard's
 * result shows it beside the deficit; the quick target keeps it behind "How
 * this was worked out".
 */
export function MetabolismCard({ plan, scanLoadFailed = false }) {
  if (!plan) return null;
  return (
    <Card data-testid="metabolism-card">
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          What you burn
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Calories at rest (BMR)</Typography>
          <Typography variant="h6">{Number(plan.bmr).toLocaleString('en-US')} cal a day</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            What your body burns doing nothing at all
          </Typography>
          <BmrSourceNote source={plan.bmrSource} leanMassLb={plan.leanMassLb} scans={plan.bmrScans} scanLoadFailed={scanLoadFailed} />
        </Box>
        <Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Calories you burn in a day (TDEE)</Typography>
          <Typography variant="h6">{Number(plan.tdee).toLocaleString('en-US')} cal a day</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {plan.activityLevel === MEASURED_ACTIVITY
              ? 'Your calories at rest plus the activity your watch measured (30-day average)'
              : `Your calories at rest plus ${ACTIVITY_WORDS[plan.activityLevel] || 'your usual activity'}`}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
