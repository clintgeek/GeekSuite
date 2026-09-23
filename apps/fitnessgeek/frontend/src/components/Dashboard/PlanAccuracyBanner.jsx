import React, { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import {
  ReportProblemOutlined as WarningIcon,
  Science as ScanIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { isPlanCalculationStale } from '@geeksuite/utils';
import { Surface } from '../primitives';

/**
 * The dashboard's one line about whether the calorie target can be trusted
 * (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D2). The plan is never rewritten for
 * the user — a ~1,000 kcal change to what they eat is theirs to make — so
 * this says so plainly and puts the wizard (which shows old vs new) one tap
 * away. At most one banner, in precedence order:
 *
 *   'stale' — the plan predates the 20 Sep BMR unit fix. An accuracy problem,
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

export default function PlanAccuracyBanner({ nutritionGoal, scanBmr }) {
  const theme = useTheme();
  const kind = planBannerKind(nutritionGoal, scanBmr);
  const key = kind === 'scan' ? planKey(nutritionGoal) : null;
  const [dismissedKey, setDismissedKey] = useState(null);

  if (!kind) return null;
  if (kind === 'scan' && (dismissedKey === key || readDismissed(key))) return null;

  const stale = kind === 'stale';
  const accent = stale ? theme.palette.warning.main : theme.palette.info.main;
  const Icon = stale ? WarningIcon : ScanIcon;

  return (
    <Surface
      role={stale ? 'alert' : 'status'}
      data-testid="plan-accuracy-banner"
      data-kind={kind}
      sx={{ borderLeft: `4px solid ${accent}`, py: 1.5 }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Icon sx={{ color: accent, fontSize: 22, mt: 0.25, flexShrink: 0 }} aria-hidden />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.9375rem' }}>
            {stale ? 'Your calorie target needs recalculating' : 'A measured BMR is available'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {stale
              ? 'It was calculated with a formula error fixed on 20 Sep and is likely too high. Recalculating shows your old and new targets before anything changes.'
              : `A measured BMR from your body scans is available (≈${fmt(scanBmr.bmr)} kcal vs ${fmt(nutritionGoal.bmr)} in your plan).`}
          </Typography>
          <Button
            component={RouterLink}
            to={WIZARD_ROUTE}
            variant={stale ? 'contained' : 'outlined'}
            size="small"
            sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 36, boxShadow: 'none' }}
          >
            {stale ? 'Recalculate' : 'Update plan'}
          </Button>
        </Box>
        {!stale && (
          <IconButton
            aria-label="Dismiss"
            size="small"
            onClick={() => {
              writeDismissed(key);
              setDismissedKey(key);
            }}
            sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Surface>
  );
}
