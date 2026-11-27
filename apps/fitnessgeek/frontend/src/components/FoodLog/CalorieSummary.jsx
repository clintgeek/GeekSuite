import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { fmt } from '../../utils/plainWords.js';
import { Surface, LabelBar } from '../primitives';

const DEFAULT_RDA = 2000;

/**
 * The day's calories as one compact panel: "1,680 of 2,340 cal … 660 left",
 * a square bar, and under it one quiet line that holds the activity allowance
 * and the settings gear. No nested box. (Keto swaps the numbers for net carbs.)
 */
const CalorieSummary = ({
  calories = 0,
  goal = 0,
  base = 0,
  add = 0,
  onSettings,
  // Mode keto props
  mode = 'standard',
  netCarbsConsumed = 0,
  netCarbLimit = 20,
  sx,
}) => {
  const theme = useTheme();

  const gear = onSettings && (
    <Tooltip title="Change your daily target">
      <IconButton
        size="small"
        onClick={onSettings}
        aria-label="Change your daily target"
        sx={{ color: 'text.secondary', mr: -0.75 }}
      >
        <SettingsIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  // ─── Keto mode ───────────────────────────────────────────────────────────
  if (mode === 'keto') {
    const consumed = Math.round(netCarbsConsumed * 10) / 10;
    const carbProgress = Math.min((netCarbsConsumed / netCarbLimit) * 100, 100);
    // Rounded to one decimal at the point of subtraction: `netCarbsConsumed`
    // arrives quantised to 0.1, so the subtraction left binary float residue
    // ("3.3999999999999986g left").
    const carbsLeft = Math.round(Math.max(0, netCarbLimit - netCarbsConsumed) * 10) / 10;
    const barColor = carbProgress >= 100
      ? theme.palette.error.main
      : carbProgress >= 70
        ? theme.palette.warning.main
        : theme.palette.primary.main;

    return (
      <Surface sx={{ py: 1, ...sx }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5 }}>
          <Typography component="span" sx={{ minWidth: 0 }}>
            <Box component="span" sx={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1 }}>{consumed}</Box>
            <Box component="span" sx={{ fontSize: '0.875rem' }}> / {netCarbLimit}g net carbs</Box>
          </Typography>
          <Typography component="span" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{carbsLeft}g left</Typography>
        </Box>
        <LabelBar
          value={carbProgress}
          segments={[{ value: carbProgress, color: barColor }]}
          label={`Net carbs: ${consumed}g of ${netCarbLimit}g`}
          height={10}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, minHeight: gear ? 32 : 'auto' }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{fmt(calories)} cal so far</Typography>
          {gear}
        </Box>
      </Surface>
    );
  }

  // ─── Standard mode ───────────────────────────────────────────────────────
  const effectiveGoal = goal > 0 ? goal : DEFAULT_RDA;
  const usingRda = goal === 0;
  const progress = Math.min((calories / effectiveGoal) * 100, 100);
  const rounded = Math.round(calories);
  // No arithmetic in the label (SIMPLE_AND_FULL_PLAN.md item 4): the activity
  // allowance is a sentence, and only when there is one.
  const showAllowance = !usingRda && base > 0 && add > 0;

  return (
    <Surface sx={{ py: 1, ...sx }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5 }}>
        <Typography component="span" sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ fontSize: '1.625rem', fontWeight: 700, lineHeight: 1 }}>{fmt(calories)}</Box>
          <Box component="span" sx={{ fontSize: '0.875rem' }}>
            {' '}of {effectiveGoal.toLocaleString('en-US')} cal{usingRda ? ' (typical day)' : ''}
          </Box>
        </Typography>
        <Typography component="span" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {rounded > effectiveGoal
            ? `${(rounded - effectiveGoal).toLocaleString('en-US')} over`
            : `${Math.max(0, effectiveGoal - rounded).toLocaleString('en-US')} left`}
        </Typography>
      </Box>
      <LabelBar
        value={progress}
        label={`Calories: ${fmt(calories)} of ${fmt(effectiveGoal)} cal`}
        height={10}
      />
      {(showAllowance || gear) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, minHeight: gear ? 32 : 'auto' }}>
          {showAllowance ? (
            <Typography data-testid="activity-allowance" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              Includes {Math.round(add).toLocaleString('en-US')} extra for today’s activity.
            </Typography>
          ) : <span />}
          {gear}
        </Box>
      )}
    </Surface>
  );
};

export default CalorieSummary;
