import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material';
import WeightChartNivo from './WeightChartNivo.jsx';
import ProgressTracker from './ProgressTracker.jsx';
import QuickAddWeight from './QuickAddWeight.jsx';
import WeightLogList from './WeightLogList.jsx';

const WeightContent = ({
  weightLogs,
  weightGoal,
  currentWeight,
  onAddWeight,
  onDeleteWeight,
  unit = 'lbs'
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Calculate the best default time range based on available data
  const getBestTimeRange = (data) => {
    if (!data || data.length === 0) return 'all';

    const sortedData = [...data].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = [
      { key: '7', days: 7 },
      { key: '30', days: 30 },
      { key: '365', days: 365 },
      { key: 'all', days: Infinity }
    ];

    for (const range of ranges) {
      const cutoffDate = new Date(mostRecentDate.getTime() - (range.days * 24 * 60 * 60 * 1000));
      const filteredCount = data.filter(item => {
        if (range.key === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      }).length;

      if (filteredCount >= 2) {
        return range.key;
      }
    }

    return 'all';
  };

  // Check if goal time range should be available (be tolerant to missing fields)
  // Expose Goal mode only when wizard goal is fully defined
  const isGoalTimeRangeAvailable = Boolean(
    weightGoal &&
    weightGoal.enabled &&
    weightGoal.startDate &&
    weightGoal.goalDate &&
    (weightGoal.startWeight != null) &&
    (weightGoal.targetWeight != null)
  );

  const [timeRangeState, setTimeRangeState] = useState(() => {
    // If goal is available, default to goal regardless of data points
    if (isGoalTimeRangeAvailable) {
      return 'goal';
    }

    return getBestTimeRange(weightLogs);
  });

  // Update time range when data loads
  React.useEffect(() => {
    if (weightLogs.length > 0) {
      // If goal is available, default to goal regardless of data points
      if (isGoalTimeRangeAvailable) {
        setTimeRangeState('goal');
        return;
      }

      const bestRange = getBestTimeRange(weightLogs);
      setTimeRangeState(bestRange);
    }
  }, [weightLogs, isGoalTimeRangeAvailable, weightGoal]);

  // Filter data based on selected time range
  const filteredWeightLogs = useMemo(() => {
    if (!weightLogs || weightLogs.length === 0) return [];

    const sortedData = [...weightLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    // Handle goal time range
    if (timeRangeState === 'goal' && weightGoal && weightGoal.enabled && weightGoal.startDate && weightGoal.goalDate) {
      const goalStartDate = new Date(weightGoal.startDate);
      const goalEndDate = new Date(weightGoal.goalDate);

      return weightLogs
        .filter(item => {
          const logDate = new Date(item.log_date);
          return logDate >= goalStartDate && logDate <= goalEndDate;
        })
        .sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
    }

    // Handle other time ranges
    const ranges = {
      '7': 7,
      '30': 30,
      '365': 365,
      'all': Infinity
    };

    const daysToSubtract = ranges[timeRangeState];
    const cutoffDate = new Date(mostRecentDate.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));

    const filtered = weightLogs
      .filter(item => {
        if (timeRangeState === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date));

    return filtered;
  }, [weightLogs, timeRangeState, weightGoal]);

  const handleTimeRangeChange = (newRange) => {
    setTimeRangeState(newRange);
  };

  // Auto-switch to better range if current range has insufficient data
  React.useEffect(() => {
    // Don't auto-switch if we're in goal mode - goal should always be available
    if (timeRangeState === 'goal') {
      return;
    }

    if (filteredWeightLogs.length < 2 && filteredWeightLogs.length > 0) {
      // First check if goal range would work
      if (isGoalTimeRangeAvailable && timeRangeState !== 'goal') {
        setTimeRangeState('goal');
        return;
      }

      const betterRange = getBestTimeRange(weightLogs);
      if (betterRange !== timeRangeState) {
        setTimeRangeState(betterRange);
      }
    }
  }, [weightLogs, timeRangeState, filteredWeightLogs.length, isGoalTimeRangeAvailable, weightGoal]);

  // Check if we have enough data points for the selected range
  const hasEnoughData = timeRangeState === 'goal' ? true : filteredWeightLogs.length >= 2;
  const insufficientDataMessage = !hasEnoughData && filteredWeightLogs.length > 0 && timeRangeState !== 'goal' ?
    `Only ${filteredWeightLogs.length} data point${filteredWeightLogs.length === 1 ? '' : 's'} in this range. Try a larger time range.` : null;

  return (
    <Box sx={{ pt: 2 }}>
      {/* Progress Tracker - only show if weight goal is set */}
      {weightGoal && weightGoal.enabled && currentWeight && weightGoal.startWeight && weightGoal.targetWeight && (
        <Box sx={{ mb: 3 }}>
          <ProgressTracker
            startValue={weightGoal.startWeight}
            currentValue={currentWeight}
            targetValue={weightGoal.targetWeight}
            startDate={weightGoal.startDate}
            goalDate={weightGoal.goalDate}
            unit={unit}
            title="Weight Progress"
          />
        </Box>
      )}

      {/* Time Range Buttons - only show if we have data */}
      {weightLogs.length > 0 && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 2
        }}>
          <ButtonGroup
            size={isMobile ? 'small' : 'medium'}
            variant="outlined"
            sx={{
              '& .MuiButton-root': {
                fontSize: isMobile ? '0.7rem' : '0.75rem',
                px: isMobile ? 1 : 1.5,
                py: isMobile ? 0.25 : 0.5,
                minWidth: isMobile ? 'auto' : '60px'
              }
            }}
          >
            <Button
              onClick={() => handleTimeRangeChange('7')}
              variant={timeRangeState === '7' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              7d
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('30')}
              variant={timeRangeState === '30' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              30d
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('365')}
              variant={timeRangeState === '365' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              1y
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('all')}
              variant={timeRangeState === 'all' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              All
            </Button>
            {isGoalTimeRangeAvailable && (
              <Button
                onClick={() => handleTimeRangeChange('goal')}
                variant={timeRangeState === 'goal' ? 'contained' : 'outlined'}
                size={isMobile ? 'small' : 'medium'}
              >
                Goal
              </Button>
            )}
          </ButtonGroup>

          {/* Insufficient data message */}
          {insufficientDataMessage && (
            <Typography variant="caption" sx={{
              color: theme.palette.warning.main,
              fontSize: '0.7rem',
              mt: 1,
              textAlign: 'center'
            }}>
              {insufficientDataMessage}
            </Typography>
          )}
        </Box>
      )}

      {/* Weight Chart */}
      {weightLogs.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <WeightChartNivo
            data={filteredWeightLogs}
            unit={unit}
            goalLine={Boolean(weightGoal && weightGoal.enabled && timeRangeState === 'goal')}
            startWeight={weightGoal?.startWeight}
            targetWeight={weightGoal?.targetWeight}
            startDate={weightGoal?.startDate}
            goalDate={weightGoal?.goalDate}
          />
        </Box>
      )}

      {/* Quick Add Weight */}
      <Box sx={{ mb: 3 }}>
        <QuickAddWeight onAdd={onAddWeight} unit={unit} />
      </Box>

      {/* Weight Log List */}
      <Box sx={{ mb: 3 }}>
        <WeightLogList
          logs={weightLogs}
          onDelete={onDeleteWeight}
          unit={unit}
        />
      </Box>
    </Box>
  );
};

export default WeightContent;