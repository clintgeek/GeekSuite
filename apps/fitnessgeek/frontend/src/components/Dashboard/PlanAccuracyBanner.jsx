import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { isPlanCalculationStale, tdeeFromBMR } from '@geeksuite/utils';
import { MEASURED_ACTIVITY, RATE_OPTIONS, minSafeCalories, planTarget } from '../FitnessGoals/planMath.js';
import { fmt } from '../../utils/plainWords.js';

/**
 * Home's note about the calorie target (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md
 * D2). The plan is never rewritten for the person: a change to what they eat
 * is theirs to make. So this is ONE calm note that says what would change,
 * with "Update" (opens the calorie plan with the new target already worked
 * out, one Save) and "Not now".
 *
 * Two reasons, in precedence order (`data-kind`):
 *
 *   'stale' — the plan was worked out by an older calculation. The new
 *             number isn't known without recalculating, so it says only
 *             "Your details have changed since your target was set."
 *   'scan'  — a measured figure from body scans exists and the plan doesn't
 *             use it. The new target is estimated from what the plan itself
 *             stores (`scanTargetEstimate`), rounded to the nearest 10 and
 *             said as "about": the calorie plan page works out the real one.
 *
 * "Not now" puts it away on this device for 30 days. It never shows while the
 * day couldn't be loaded (`suppress`): a card that says "Can't reach
 * FitnessGeek" must not also be offering to change a target.
 */

export const WIZARD_ROUTE = '/calorie-wizard';
export const UPDATE_ROUTE = `${WIZARD_ROUTE}?update=1`;
// Versioned: the value is the time it was put away (ms), not a flag. The old
// per-plan 'fg.dashboard.scanBmrBanner.dismissed:*' keys are simply ignored.
export const DISMISS_KEY = 'fg.home.planNote.dismissedAt.v2';
export const DISMISS_DAYS = 30;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

/** A saved, enabled plan with a target — anything else gets no banner. */
const hasPlan = (ng) => !!ng && ng.enabled !== false && Number(ng.daily_calorie_target) > 0;

/** Which banner, if any: 'stale' | 'scan' | null. Pure, for tests. */
export function planBannerKind(nutritionGoal, scanBmr) {
  if (!hasPlan(nutritionGoal)) return null;
  if (isPlanCalculationStale(nutritionGoal)) return 'stale';
  if (scanBmr?.source === 'scan' && Number(scanBmr?.bmr) > 0 && nutritionGoal.bmr_source !== 'scan') return 'scan';
  return null;
}

// Every storage touch is wrapped: private windows, blocked site data and the
// harness can all throw on access. Failing closed means "not dismissed".
function dismissedRecently(now = Date.now()) {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    // A time in the future (a clock that was wrong) is not a dismissal.
    return Number.isFinite(at) && at > 0 && at <= now && now - at < DISMISS_MS;
  } catch {
    return false;
  }
}
function writeDismissed(now = Date.now()) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(now));
  } catch {
    // The dismissal still holds for this page view via state.
  }
}

/**
 * About what the target becomes once the plan uses the body scans' figure,
 * from what the plan already stores: the same activity, the same speed, the
 * plan page's own floor and target arithmetic (planMath.js). Rounded to the
 * nearest 10 because it is an estimate; null when the plan doesn't hold
 * enough to say, or when it would come out the same.
 */
export function scanTargetEstimate(nutritionGoal, scanBmr) {
  const ng = nutritionGoal || {};
  const scan = Number(scanBmr?.bmr);
  const current = Number(ng.daily_calorie_target);
  const rate = Number(ng.weight_change_rate);
  if (!(scan > 0) || !(current > 0) || !Number.isFinite(rate) || rate < 0 || ng.weight_change_rate == null) return null;
  let tdee;
  if (ng.activity_level === MEASURED_ACTIVITY) {
    const stored = Number(ng.calc_inputs?.active_kcal);
    const active = Number.isFinite(stored) && stored >= 0 ? stored : Number(ng.tdee) - Number(ng.bmr);
    if (!Number.isFinite(active) || active < 0) return null;
    tdee = Math.round(scan + active);
  } else if (ng.activity_level) {
    tdee = tdeeFromBMR(scan, ng.activity_level);
  } else {
    return null;
  }
  // A saved rate the safety floor slowed down goes back to the speed that
  // was asked for, as the plan page does.
  const requested = rate > 0 ? (RATE_OPTIONS.find((o) => o >= rate) ?? RATE_OPTIONS[RATE_OPTIONS.length - 1]) : 0;
  const { dailyCalories } = planTarget({ tdee, requestedRate: requested, minSafe: minSafeCalories(scan) });
  const about = Math.round(dailyCalories / 10) * 10;
  if (!(about > 0) || about === Math.round(current / 10) * 10) return null;
  return about;
}

/** The one line: what would change, with the numbers when they are known. */
export function planNoteWords(kind, nutritionGoal, scanBmr) {
  if (kind === 'stale') return 'Your details have changed since your target was set.';
  const about = scanTargetEstimate(nutritionGoal, scanBmr);
  return about
    ? `Your body scans suggest a target of about ${fmt(about)} calories.`
    : 'Your body scans can make your target more accurate.';
}

// Small buttons, full 44px tap height.
const actionSx = { minHeight: 44, px: 4, fontWeight: 700, textTransform: 'none' };

export default function PlanAccuracyBanner({ nutritionGoal, scanBmr, suppress = false, sx }) {
  const kind = planBannerKind(nutritionGoal, scanBmr);
  const [dismissed, setDismissed] = useState(false);

  if (!kind || suppress || dismissed || dismissedRecently()) return null;

  return (
    <Box
      role="status"
      data-testid="plan-accuracy-banner"
      data-kind={kind}
      sx={{
        fontSize: '0.9375rem',
        lineHeight: 1.4,
        color: 'text.secondary',
        ...sx,
        // Its own layout, whatever the caller's sx says about padding: 16px
        // at the sides, 12px above and below (the spacing unit is 4px).
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        px: 4,
        py: 3,
      }}
    >
      <Typography data-testid="plan-note-words" sx={{ fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>
        {planNoteWords(kind, nutritionGoal, scanBmr)}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button component={RouterLink} to={UPDATE_ROUTE} variant="tonal" size="small" sx={actionSx}>
          Update
        </Button>
        {/* Put off with a word, never an unlabelled ✕. */}
        <Button
          variant="text"
          size="small"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
          sx={{ ...actionSx, color: 'text.secondary' }}
        >
          Not now
        </Button>
      </Box>
    </Box>
  );
}
