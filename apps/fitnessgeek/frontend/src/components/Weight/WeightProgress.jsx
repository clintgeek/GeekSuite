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
import { rollingMean, utcDateString } from '@geeksuite/utils';
import { StatNumber, SectionLabel } from '../primitives';

const WeightProgress = ({
  weightLogs = [],
  goal = null,
  currentWeight = null,
  unit = 'lbs',
  onEditGoal
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

    // Calculate time metrics
    const weeksSinceStart = differenceInWeeks(today, startDate);
    const weeksToGoal = differenceInWeeks(goalDate, today);
    const daysToGoal = differenceInDays(goalDate, today);
    const totalWeeks = differenceInWeeks(goalDate, startDate);
    const timeProgressPercent = Math.min((weeksSinceStart / totalWeeks) * 100, 100);

    // Calculate current rate using 6-week average (or all available data if less than 6 weeks)
    const sixWeeksAgo = new Date(today);
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42); // 6 weeks = 42 days

    const recentLogs = weightLogs
      .filter(log => {
        const logDate = parseISO(log.log_date);
        return logDate >= sixWeeksAgo && logDate <= today;
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date));

    let currentRate = 0;
    let useGoalRateForProjection = false;

    if (recentLogs.length >= 2) {
      const firstLog = recentLogs[0];
      const lastLog = recentLogs[recentLogs.length - 1];
      const weeksDiff = differenceInWeeks(parseISO(lastLog.log_date), parseISO(firstLog.log_date)) || 1;
      // 7-day trailing means at both ends, not the two raw readings. The
      // caption below has always said "6-week average", but this subtracted
      // one weigh-in from another — a reading-to-reading delta, so a water
      // day at either end moved the rate by ~0.4 lb/week (BODY_DATA_PLAN §0).
      // The means use every log, so the first one still sees the days
      // before the six-week window.
      const meanByDay = new Map(
        rollingMean(
          weightLogs.map((l) => ({ date: utcDateString(l.log_date), value: Number(l.weight_value) })),
          { windowDays: 7 }
        ).map((m) => [utcDateString(m.date), m.mean])
      );
      const firstMean = meanByDay.get(utcDateString(firstLog.log_date)) ?? firstLog.weight_value;
      const lastMean = meanByDay.get(utcDateString(lastLog.log_date)) ?? lastLog.weight_value;
      const weightChange = lastMean - firstMean;
      currentRate = weightChange / weeksDiff;

      // If less than 3 weeks of data, use goal rate for projection
      if (weeksDiff < 3) {
        useGoalRateForProjection = true;
      }
    } else {
      useGoalRateForProjection = true;
    }

    // Calculate if on track
    const remainingWeight = Math.abs(goal.targetWeight - currentWeight);
    // No saved goal rate → no ahead/behind verdict (it used to be NaN, which
    // rendered "On track" beside an off-track projection card).
    const goalRateAbs = Math.abs(Number(goal.ratePerWeek)) || null;
    const weeksNeeded = goalRateAbs ? remainingWeight / goalRateAbs : null;
    const daysAheadBehind = weeksNeeded === null ? 0 : Math.round((weeksToGoal - weeksNeeded) * 7);

    // Projected completion date
    let projectedDate;
    if (useGoalRateForProjection) {
      // Use goal date for first 3 weeks
      projectedDate = goalDate;
    } else {
      // Use 6-week average rate
      // `currentRate` is SIGNED — negative while losing. `Math.abs` on the
      // quotient hid the case that matters: someone gaining 0.33 lb/week
      // against a 20 lb loss goal got a tidy "60 weeks" and a projected
      // completion date, rather than the truth, which is that this rate never
      // arrives. A rate pointing the wrong way now yields Infinity and falls
      // through to the isFinite guard below, which shows the goal date rather
      // than a fabricated one.
      const rateToUse = currentRate || goal.ratePerWeek;
      const movingTowardGoal = (goal.targetWeight - currentWeight) === 0
        || Math.sign(rateToUse) === Math.sign(goal.targetWeight - currentWeight);
      const projectedWeeks = movingTowardGoal
        ? Math.abs(remainingWeight / rateToUse)
        : Infinity;
      projectedDate = new Date(today);

      // Validate projected weeks is a valid number
      if (isNaN(projectedWeeks) || !isFinite(projectedWeeks)) {
        projectedDate = goalDate; // Default to goal date
      } else {
        projectedDate.setDate(projectedDate.getDate() + (projectedWeeks * 7));
      }
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
      projectedDate: isNaN(projectedDate.getTime()) ? null : projectedDate,
      isOnTrack,
      isAhead,
      isBehind,
      timeProgressPercent,
      useGoalRateForProjection
    };
    } catch (error) {
      console.error('Error calculating weight progress insights:', error);
      return null;
    }
  }, [weightLogs, goal, currentWeight, unit]);

  if (!goal || !goal.enabled || !insights) {
    return (
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${theme.palette.divider}`
      }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <GoalIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 1 }}>
            No Weight Goal Set
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 3 }}>
            Set a weight goal to track your progress and get personalized insights
          </Typography>
          {onEditGoal && (
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
              Set Weight Goal
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
              {Math.abs(insights.currentRate || 0).toFixed(1)} {unit}/week
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
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
              {insights.projectedDate ? format(insights.projectedDate, 'MMMM dd, yyyy') : 'N/A'}
            </Typography>
            <Typography variant="caption" sx={{ color: projectionMuted }}>
              {insights.useGoalRateForProjection
                ? `On schedule at goal rate of ${Math.abs(insights.goalRate || 0).toFixed(1)} ${unit}/week`
                : `At ${Math.abs(insights.currentRate || 0).toFixed(1)} ${unit}/week, your 7-day average over the last 6 weeks`
              }
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightProgress;
