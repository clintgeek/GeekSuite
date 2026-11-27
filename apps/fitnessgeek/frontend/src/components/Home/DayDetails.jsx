import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MacroStrip from './MacroStrip.jsx';
import DayTargetEditor from './DayTargetEditor.jsx';
import { WIZARD_ROUTE } from '../Dashboard/PlanAccuracyBanner.jsx';

/**
 * What sits behind "Macros and details" on Today (DOCS/ONE_APP_PLAN.md §1.2):
 *
 *   - the day's totals against target, a row and a bar each: eaten, protein,
 *     carbs and fat (or fat, protein and net carbs in keto);
 *   - in keto, a note when a food listed no fiber;
 *   - today only: the activity add-back in a sentence, and "Change today's
 *     target";
 *   - the way to the calorie plan.
 *
 * `totals` is left out when the day's summary couldn't be read: a failed
 * read is never drawn as zeros.
 */
export default function DayDetails({
  isToday = true,
  day,
  totals = null,
  planMode = 'standard',
  netCarbLimit = 20,
  proteinNote = null,
  missingFiber = false,
  goal = 0,
  allowance = { base: 0, add: 0 },
  onTargetSaved,
}) {
  // No arithmetic in the label: the allowance is a sentence, and only when
  // there is one.
  const showAllowance = isToday && goal > 0 && allowance.base > 0 && allowance.add > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {totals && (
        <MacroStrip
          head={false}
          calories={{ current: totals.calories, goal }}
          protein={totals.protein}
          carbs={totals.carbs}
          fat={totals.fat}
          mode={planMode}
          netCarbsConsumed={totals.netCarbs}
          netCarbLimit={netCarbLimit}
          proteinNote={proteinNote}
        />
      )}
      {planMode === 'keto' && missingFiber && (
        <Typography data-testid="missing-fiber-note" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          A food with no fiber listed counts all its carbs as net carbs.
        </Typography>
      )}
      {showAllowance && (
        <Typography data-testid="activity-allowance" sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>
          Includes {Math.round(allowance.add).toLocaleString('en-US')} extra for today’s activity.
        </Typography>
      )}
      {isToday && <DayTargetEditor day={day} goal={goal} onSaved={onTargetSaved} />}
      <Box>
        <Button
          component={RouterLink}
          to={WIZARD_ROUTE}
          variant="text"
          data-testid="calorie-plan-link"
          sx={{ minHeight: 44, ml: -2, px: 2, fontWeight: 600, textTransform: 'none' }}
        >
          Calorie plan
        </Button>
      </Box>
    </Box>
  );
}
