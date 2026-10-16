import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Flag as GoalIcon,
  Edit as EditIcon,
  CalendarToday as CalendarIcon,
  Speed as SpeedIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { differenceInWeeks, differenceInDays, parseISO, format } from 'date-fns';
import { readableOn } from '@geeksuite/ui';
import { programPace } from './weightTrend.js';
import { StatNumber, SectionLabel } from '../primitives';

const WeightProgress = ({
  weightLogs = [],
  goal = null,
  currentWeight = null,
  unit = 'lbs',
  onEditGoal,
  // The first run's answer, in her words (`experience.goal`). "Lose a little"
  // was stored and never used (review Phase 2.14); here it turns the empty
  // card into the next step.
  firstRunGoal = null
}) => {
  const theme = useTheme();
  const insights = useMemo(() => {
    if (!goal || !goal.enabled || !currentWeight || !goal.startDate || !goal.goalDate) {
      return null;
    }

    try {
      const startDate = parseISO(goal.startDate);
      const goalDate = parseISO(goal.goalDate);
      const today = new Date();

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(goalDate.getTime())) {
        return null;
      }

    // PROGRESS IS DIRECTIONAL. Both of these used to be wrapped in
    // `Math.abs`, which threw the direction away and counted movement AWAY
    // from the target as progress: start 200, target 180, now 210 rendered
    // "50.0% Complete" with a half-filled bar — sitting next to a correctly
    // computed "30.0 lbs to go" — and 220 rendered 100%. The right answer in
    // both cases is 0%.
    //
    // Signed delta over signed goal: same sign means moving toward the
    // target, opposite means away. Clamped to 0..100, so overshooting reads
    // as complete and backsliding reads as none.
    const goalDelta = goal.targetWeight - goal.startWeight;
    const currentDelta = currentWeight - goal.startWeight;
    // A maintenance goal (target === start) has no distance to cover; 0/0 used
    // to produce NaN, which rendered "0.0%" on the label but passed NaN to the
    // progress bar's `value`.
    const progressPercent = goalDelta === 0
      ? (currentDelta === 0 ? 100 : 0)
      : Math.min(Math.max((currentDelta / goalDelta) * 100, 0), 100);

    // Calculate time metrics. Before the start date "time elapsed" is 0, not
    // negative.
    const weeksToGoal = Math.max(0, differenceInWeeks(goalDate, today));
    const daysToGoal = Math.max(0, differenceInDays(goalDate, today));
    const totalDays = Math.max(1, differenceInDays(goalDate, startDate));
    const timeProgressPercent = Math.min(Math.max((differenceInDays(today, startDate) / totalDays) * 100, 0), 100);

    // PACE IS THE PROGRAM'S (weightTrend.js `programPace`, Chef 2026-10-14).
    // This used to be "the last 6 weeks of logs", whatever the goal said —
    // before a program, or early in one, that measured the flat weight of
    // life before it, and remaining ÷ ~0 projected "2050". Now: weigh-ins on
    // or after the start date only; no rate and no forecast until two weeks
    // of them; and a forecast more than two plan-lengths out is not printed
    // as a date.
    const remainingWeight = Math.abs(goal.targetWeight - currentWeight);
    const pace = programPace(weightLogs, goal);
    const measured = pace.phase === 'measured';
    const currentRate = measured ? pace.slopePerWeek : null;
    const useGoalRateForProjection = !measured;

    let projectedDate = null;
    let daysAheadBehind = 0;
    if (!measured) {
      // Not started, or too early to measure: the plan is the projection.
      projectedDate = goalDate;
    } else if (pace.projectedDate) {
      projectedDate = new Date(`${pace.projectedDate}T12:00:00`);
      daysAheadBehind = differenceInDays(goalDate, projectedDate);
    } else if (pace.heading === 'toward' || pace.heading === 'flat') {
      // Heading the right way, just slowly: behind by more than a plan.
      daysAheadBehind = -totalDays;
    } else if (pace.heading === 'away') {
      daysAheadBehind = -totalDays;
    }

    // Status
    const isOnTrack = Math.abs(daysAheadBehind) <= 7; // Within 1 week
    const isAhead = daysAheadBehind > 7;
    const isBehind = daysAheadBehind < -7;

    return {
      progressPercent,
      currentRate,
      goalRate: goal.ratePerWeek,
      remainingWeight,
      daysToGoal,
      weeksToGoal,
      daysAheadBehind,
      projectedDate: projectedDate && !isNaN(projectedDate.getTime()) ? projectedDate : null,
      isOnTrack,
      isAhead,
      isBehind,
      timeProgressPercent,
      useGoalRateForProjection,
      pace
    };
    } catch (error) {
      console.error('Error calculating weight progress insights:', error);
      return null;
    }
  }, [weightLogs, goal, currentWeight, unit]);

  if (!goal || !goal.enabled || !insights) {
    const noGoal = !goal || !goal.enabled;
    // A goal with nothing to measure yet is not a missing goal.
    const needsWeighIn = !noGoal && !currentWeight;
    if (noGoal && firstRunGoal === 'lose' && onEditGoal) {
      // One sentence, one button. No heading announcing what's missing.
      return (
        <Card sx={{
          borderRadius: '20px',
          boxShadow: theme.shadows[1],
          border: `1px solid ${theme.palette.divider}`
        }}>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ color: 'text.primary', fontSize: '1.0625rem', lineHeight: 1.5, mb: 2 }}>
              You said you&rsquo;d like to lose a little. Set a goal and this page will show how it&rsquo;s going.
            </Typography>
            <Button
              variant="contained"
              startIcon={<GoalIcon />}
              onClick={onEditGoal}
              fullWidth
              sx={{ minHeight: 48, borderRadius: '999px', textTransform: 'none', fontWeight: 700, maxWidth: { sm: 320 } }}
            >
              Set your goal
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${theme.palette.divider}`
      }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <GoalIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 1 }}>
            {needsWeighIn ? 'Weigh in to see your progress' : 'No weight goal yet'}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 3 }}>
            {needsWeighIn
              ? 'Your goal is set. Log a weight and your progress shows here.'
              : 'Set a weight goal and this page will show how it’s going.'}
          </Typography>
          {onEditGoal && !needsWeighIn && (
            <Button
              variant="contained"
              startIcon={<GoalIcon />}
              onClick={onEditGoal}
              sx={{
                borderRadius: '999px',
                px: 3,
                textTransform: 'none',
                fontWeight: 700,
              }}
            >
              Set your goal
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Theme palette only — no hex literals (F10). Status colours are domain
  // colours: as a fill they are tinted with `alpha`, and as TEXT they go
  // through `readableOn` against the tint they actually sit on, the way
  // BPInsights does it.
  const isDark = theme.palette.mode === 'dark';
  const paper = theme.palette.background.paper;

  const getTrendIcon = () => {
    if (insights.isAhead) return <TrendingUpIcon sx={{ color: theme.palette.success.main }} />;
    if (insights.isBehind) return <TrendingDownIcon sx={{ color: theme.palette.error.main }} />;
    return <TrendingFlatIcon sx={{ color: theme.palette.primary.main }} />;
  };

  const getStatusColor = () => {
    if (insights.isAhead) return theme.palette.success.main;
    if (insights.isBehind) return theme.palette.error.main;
    return theme.palette.primary.main;
  };

  const statusTint = alpha(getStatusColor(), isDark ? 0.14 : 0.08);
  const statusInk = readableOn(getStatusColor(), statusTint, { under: paper });

  const tileBg = isDark ? alpha(theme.palette.text.primary, 0.04) : theme.palette.background.default;

  const projectionTone = insights.isOnTrack ? theme.palette.success.main : theme.palette.error.main;
  const projectionTint = alpha(projectionTone, isDark ? 0.12 : 0.06);
  const projectionMuted = readableOn(theme.palette.text.secondary, projectionTint, { under: paper });

  const getStatusText = () => {
    if (insights.isAhead) return `${Math.abs(insights.daysAheadBehind)} days ahead`;
    if (insights.isBehind) return `${Math.abs(insights.daysAheadBehind)} days behind`;
    return 'On track';
  };

  return (
    <Card sx={{
      borderRadius: '20px',
      boxShadow: theme.shadows[1],
      border: `1px solid ${theme.palette.divider}`
    }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        {/* Editorial header — goal values as primary display */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 3,
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SectionLabel sx={{ mb: 1 }}>Active Weight Goal</SectionLabel>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: { xs: 1, sm: 1.5 },
                flexWrap: 'wrap',
              }}
            >
              <StatNumber
                value={goal.startWeight}
                unit={unit}
                size="display"
                decimals={0}
                color={alpha(theme.palette.text.primary, 0.5)}
              />
              <ArrowIcon sx={{ color: 'text.secondary', fontSize: 20, alignSelf: 'center' }} />
              <StatNumber
                value={goal.targetWeight}
                unit={unit}
                size="display"
                decimals={0}
                color={theme.palette.primary.main}
              />
            </Box>
          </Box>
          {onEditGoal && (
            <Button
              size="small"
              startIcon={<EditIcon />}
              onClick={onEditGoal}
              sx={{
                borderRadius: '999px',
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                color: theme.palette.primary.main,
                flexShrink: 0,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              Edit
            </Button>
          )}
        </Box>

        {/* Progress Bar */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {(insights.progressPercent || 0).toFixed(1)}% Complete
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {(insights.remainingWeight || 0).toFixed(1)} {unit} to go
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={insights.progressPercent}
            aria-label={`Progress to goal weight: ${(insights.progressPercent || 0).toFixed(1)}% complete`}
            sx={{
              height: 12,
              borderRadius: '999px',
              backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.06),
              '& .MuiLinearProgress-bar': {
                borderRadius: '999px',
                backgroundColor: theme.palette.primary.main
              }
            }}
          />
        </Box>

        {/* Status Chip */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          {getTrendIcon()}
          <Chip
            label={getStatusText()}
            sx={{
              backgroundColor: statusTint,
              color: statusInk,
              fontWeight: 700,
              border: `1px solid ${alpha(getStatusColor(), 0.3)}`,
              borderRadius: '999px'
            }}
          />
        </Box>

        {/* Insights Grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2
        }}>
          {/* Current Rate */}
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            backgroundColor: tileBg,
            border: `1px solid ${theme.palette.divider}`
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SpeedIcon sx={{ fontSize: 18, color: theme.palette.primary.main }} />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                Current Rate
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {insights.currentRate === null ? '—' : `${Math.abs(insights.currentRate).toFixed(1)} ${unit}/week`}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {insights.currentRate === null ? `${rateWaitText(insights.pace)} · ` : 'Since your start · '}
              Goal: {Math.abs(insights.goalRate || 0).toFixed(1)} {unit}/week
            </Typography>
          </Box>

          {/* Time Remaining */}
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            backgroundColor: tileBg,
            border: `1px solid ${theme.palette.divider}`
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CalendarIcon sx={{ fontSize: 18, color: theme.palette.primary.main }} />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                Time Remaining
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {insights.weeksToGoal || 0} weeks
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {insights.daysToGoal || 0} days until {goal?.goalDate ? format(parseISO(goal.goalDate), 'MMM dd') : 'N/A'}
            </Typography>
          </Box>

          {/* Projected Completion */}
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            backgroundColor: projectionTint,
            border: `1px solid ${alpha(projectionTone, 0.25)}`,
            gridColumn: { xs: '1', sm: 'span 2' }
          }}>
            <Typography variant="caption" sx={{ color: projectionMuted, fontWeight: 600, display: 'block', mb: 1 }}>
              Projected Completion
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {projectionHeadline(insights)}
            </Typography>
            <Typography variant="caption" sx={{ color: projectionMuted }}>
              {projectionCaption(insights, unit)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

const fmtDay = (d) => (d ? format(d, 'MMMM d, yyyy') : '');
const fmtYmd = (ymd) => (ymd ? format(new Date(`${ymd}T12:00:00`), 'MMM d') : '');

/** Why there's no measured rate yet. */
function rateWaitText(pace) {
  if (pace?.phase === 'not-started') return `Starts ${fmtYmd(pace.startDate)}`;
  const left = Math.max(1, 14 - (pace?.programDays || 0));
  return `Measured after 2 weeks in (${left} day${left === 1 ? '' : 's'} to go)`;
}

/** The projection tile's big line: a date only when there is an honest one. */
function projectionHeadline(insights) {
  const { pace } = insights;
  if (!pace || pace.phase !== 'measured') return fmtDay(insights.projectedDate);
  if (pace.projectedDate) return fmtDay(insights.projectedDate);
  if (pace.heading === 'away') return 'Not on pace yet';
  return 'Well behind plan';
}

/** …and what it is based on. */
function projectionCaption(insights, unit) {
  const { pace } = insights;
  const goalRate = `${Math.abs(insights.goalRate || 0).toFixed(1)} ${unit}/week`;
  if (!pace || pace.phase === 'none') return `Your plan, at ${goalRate}`;
  if (pace.phase === 'not-started') return `Your plan, at ${goalRate} — the program starts ${fmtYmd(pace.startDate)}`;
  if (pace.phase === 'too-early') return `Your plan, at ${goalRate}, until there are two weeks of weigh-ins to measure your own pace`;
  const rate = `${Math.abs(pace.slopePerWeek || 0).toFixed(1)} ${unit}/week`;
  if (pace.projectedDate) return `At ${rate}, your trend since starting ${fmtYmd(pace.startDate)}`;
  if (pace.heading === 'away') return `Your trend since ${fmtYmd(pace.startDate)} is heading away from the target — early weeks are noisy`;
  return `At ${rate} since ${fmtYmd(pace.startDate)}, the finish is more than twice the plan's length out`;
}

export default WeightProgress;
