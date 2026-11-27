import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { isPlanCalculationStale } from '@geeksuite/utils';

/**
 * Home's one line about the calorie target (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md
 * D2). The plan is never rewritten for the person: a change to what they eat
 * is theirs to make. So this is ONE calm note, "Your target can be more
 * accurate now.", with one action, "Update", that opens the calorie plan with
 * the new target already worked out beside the old one and a single Save.
 *
 * Why it can be more accurate is not said here; the plan page keeps the facts
 * under "How this was worked out". There are two reasons, in precedence order
 * (`data-kind`, for tests and the harness; the words are the same):
 *
 *   'stale' — the plan was worked out by an older calculation.
 *   'scan'  — a measured figure from body scans exists and the plan doesn't
 *             use it.
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
      <Typography component="span" sx={{ fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
        Your target can be more accurate now.
      </Typography>
      <Box component="span" sx={{ display: 'inline-flex', gap: 1 }}>
        <Button component={RouterLink} to={UPDATE_ROUTE} variant="text" sx={linkSx}>
          Update
        </Button>
        {/* Put off with a word, never an unlabelled ✕. */}
        <Button
          variant="text"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
          sx={{ ...linkSx, color: 'text.secondary' }}
        >
          Not now
        </Button>
      </Box>
    </Box>
  );
}
