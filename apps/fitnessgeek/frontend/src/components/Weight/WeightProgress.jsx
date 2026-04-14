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

    // Calculate progress
    const totalWeightChange = Math.abs(goal.targetWeight - goal.startWeight);
    const currentWeightChange = Math.abs(currentWeight - goal.startWeight);
    const progressPercent = Math.min((currentWeightChange / totalWeightChange) * 100, 100);

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
      const weightChange = lastLog.weight_value - firstLog.weight_value;
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
    const weeksNeeded = Math.abs(remainingWeight / Math.abs(goal.ratePerWeek));
    const daysAheadBehind = Math.round((weeksToGoal - weeksNeeded) * 7);

    // Projected completion date
    let projectedDate;
    if (useGoalRateForProjection) {
      // Use goal date for first 3 weeks
      projectedDate = goalDate;
    } else {
      // Use 6-week average rate
      const rateToUse = currentRate || goal.ratePerWeek;
      const projectedWeeks = Math.abs(remainingWeight / rateToUse);
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

  const getTrendIcon = () => {
    if (insights.isAhead) return <TrendingUpIcon sx={{ color: '#10b981' }} />;
    if (insights.isBehind) return <TrendingDownIcon sx={{ color: '#ef4444' }} />;
    return <TrendingFlatIcon sx={{ color: theme.palette.primary.main }} />;
  };

  const getStatusColor = () => {
    if (insights.isAhead) return theme.palette.success.main;
    if (insights.isBehind) return theme.palette.error.main;
    return theme.palette.primary.main;
  };

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
                fontSize: '0.6875rem',
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
            sx={{
              height: 12,
              borderRadius: '999px',
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : theme.palette.grey[100],
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
              backgroundColor: `${getStatusColor()}15`,
              color: getStatusColor(),
              fontWeight: 700,
              border: `1px solid ${getStatusColor()}30`,
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
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
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
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
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
            backgroundColor: insights.isOnTrack
              ? (theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)')
              : (theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'),
            border: `1px solid ${insights.isOnTrack ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            gridColumn: { xs: '1', sm: 'span 2' }
          }}>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, display: 'block', mb: 1 }}>
              Projected Completion
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {insights.projectedDate ? format(insights.projectedDate, 'MMMM dd, yyyy') : 'N/A'}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {insights.useGoalRateForProjection
                ? `On schedule at goal rate of ${Math.abs(insights.goalRate || 0).toFixed(1)} ${unit}/week`
                : `Based on 6-week average of ${Math.abs(insights.currentRate || 0).toFixed(1)} ${unit}/week`
              }
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightProgress;
