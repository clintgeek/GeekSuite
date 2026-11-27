import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { isPlanCalculationStale } from '@geeksuite/utils';

/**
 * The dashboard's one line about whether the calorie target can be trusted
 * (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D2). The plan is never rewritten for
 * the user — a ~1,000 kcal change to what they eat is theirs to make — so
 * this says so plainly and puts the wizard (which shows old vs new) one tap
 * away. At most one banner, in precedence order:
 *
 *   'stale' — the plan predates the Sep 20 BMR unit fix. An accuracy problem,
 *             so it is NOT dismissible; it goes when the plan is re-saved.
 *   'scan'  — a measured (Katch-McArdle) BMR exists and the plan doesn't use
 *             it. An improvement on offer, so it is dismissible, remembered
 *             per plan so a new plan can offer it again.
 */

export const WIZARD_ROUTE = '/calorie-wizard';
const DISMISS_PREFIX = 'fg.dashboard.scanBmrBanner.dismissed:';

/** A saved, enabled plan with a target — anything else gets no banner. */
const hasPlan = (ng) => !!ng && ng.enabled !== false && Number(ng.daily_calorie_target) > 0;

/** Which banner, if any: 'stale' | 'scan' | null. Pure, for tests. */
export function planBannerKind(nutritionGoal, scanBmr) {
  if (!hasPlan(nutritionGoal)) return null;
  if (isPlanCalculationStale(nutritionGoal)) return 'stale';
  if (scanBmr?.source === 'scan' && Number(scanBmr?.bmr) > 0 && nutritionGoal.bmr_source !== 'scan') return 'scan';
  return null;
}

/** Identifies one saved plan, so dismissing its offer doesn't silence the next plan's. */
export const planKey = (ng) => `${ng?.start_date || 'nostart'}|${Math.round(Number(ng?.bmr) || 0)}|${Math.round(Number(ng?.daily_calorie_target) || 0)}`;

// Every storage touch is wrapped: private windows, blocked site data and the
// harness can all throw on access. Failing closed means "not dismissed".
function readDismissed(key) {
  try {
    return window.localStorage.getItem(DISMISS_PREFIX + key) === '1';
  } catch {
    return false;
  }
}
function writeDismissed(key) {
  try {
    window.localStorage.setItem(DISMISS_PREFIX + key, '1');
  } catch {
    // The dismissal still holds for this page view via state.
  }
}

const fmt = (n) => Math.round(Number(n)).toLocaleString('en-US');

/**
 * One sentence and one link (SIMPLE_AND_FULL_PLAN.md item 4). The job is
 * still live — a plan saved before the Sep 20 fix really is ~1,000 kcal high,
 * and it is deliberately never rewritten for the person — so it stays, said
 * plainly. The link says what it leads to: the calorie plan opens on WHY
 * ("See why") with one button that works out a new target from today's
 * details and shows it beside the old one before anything changes
 * (AIGoalPlanner.jsx, the `notice` on the saved plan).
 *
 * This is a quiet note at the foot of Home's nutrition card, not a banner
 * above it — a muted sentence with its
 * action as a blue text link, so it never pushes the meals below the fold.
 * The stale note still announces itself (role="alert"); the scan offer is a
 * status, and may be put off with "Not now".
 */
const linkSx = {
  minHeight: 44,
  minWidth: 0,
  px: 0.5,
  py: 0,
  fontSize: 'inherit',
  fontWeight: 700,
  textTransform: 'none',
  verticalAlign: 'baseline',
  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
};

export default function PlanAccuracyBanner({ nutritionGoal, scanBmr, sx }) {
  const kind = planBannerKind(nutritionGoal, scanBmr);
  const key = kind === 'scan' ? planKey(nutritionGoal) : null;
  const [dismissedKey, setDismissedKey] = useState(null);

  if (!kind) return null;
  if (kind === 'scan' && (dismissedKey === key || readDismissed(key))) return null;

  const stale = kind === 'stale';

  return (
    <Box
      role={stale ? 'alert' : 'status'}
      data-testid="plan-accuracy-banner"
      data-kind={kind}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 0.5,
        fontSize: '0.875rem',
        lineHeight: 1.4,
        color: 'text.secondary',
        ...sx,
      }}
    >
      <Typography component="span" sx={{ fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit', fontWeight: stale ? 700 : 400 }}>
        {stale
          ? 'Your daily calorie target is probably too high.'
          : `Your body scans say you burn ${fmt(scanBmr.bmr)} calories a day at rest. Your plan uses ${fmt(nutritionGoal.bmr)}.`}
      </Typography>
      <Box component="span" sx={{ display: 'inline-flex', gap: 1 }}>
        <Button component={RouterLink} to={WIZARD_ROUTE} variant="text" sx={linkSx}>
          {stale ? 'See why' : 'Update my plan'}
        </Button>
        {/* Where it may be put off, a "Not now" — never an unlabelled ✕.
            The stale note stays undismissable (see above). */}
        {!stale && (
          <Button
            variant="text"
            onClick={() => {
              writeDismissed(key);
              setDismissedKey(key);
            }}
            sx={{ ...linkSx, color: 'text.secondary' }}
          >
            Not now
          </Button>
        )}
      </Box>
    </Box>
  );
}
