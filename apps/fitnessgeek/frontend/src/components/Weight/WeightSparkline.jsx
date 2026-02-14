import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  ButtonGroup,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  TrendingDown,
  TrendingUp,
  Remove
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const WeightSparkline = ({ data, goalLine, startWeight, targetWeight }) => {
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

    return 'all'; // Fallback to all if no range has 2+ points
  };

  const [timeRange, setTimeRange] = useState(() => getBestTimeRange(data));

    // Filter data based on selected time range
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort data by date first to get the most recent date
    const sortedData = [...data].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = {
      '7': 7,
      '30': 30,
      '365': 365,
      'all': Infinity
    };

    const daysToSubtract = ranges[timeRange];
    const cutoffDate = new Date(mostRecentDate.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));

    const filtered = data
      .filter(item => {
        if (timeRange === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      })
      .map(item => ({
        date: new Date(item.log_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        value: parseFloat(item.weight_value),
        fullDate: item.log_date
      }))
      .sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

    return filtered;
  }, [data, timeRange]);

  // Check if we have enough data points for the selected range
  const hasEnoughData = filteredData.length >= 2;
  const insufficientDataMessage = !hasEnoughData && filteredData.length > 0 ?
    `Only ${filteredData.length} data point${filteredData.length === 1 ? '' : 's'} in this range. Try a larger time range.` : null;

  // Create goal line data
  let combinedData = [...filteredData];

  if (goalLine && startWeight && targetWeight && filteredData.length > 0) {
    const firstDate = new Date(filteredData[0].fullDate);
    const lastDate = new Date(filteredData[filteredData.length - 1].fullDate);

    const totalWeightLoss = parseFloat(startWeight) - parseFloat(targetWeight);
    const totalDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const dailyWeightLoss = totalDays > 0 ? totalWeightLoss / totalDays : 0;

    filteredData.forEach((dataPoint, index) => {
      const currentDate = new Date(dataPoint.fullDate);
      const daysFromStart = (currentDate - firstDate) / (1000 * 60 * 60 * 24);
      const expectedWeight = parseFloat(startWeight) - (dailyWeightLoss * daysFromStart);

      combinedData[index].goalValue = expectedWeight;
    });
  }

  // Get current and previous weights for trend calculation
  const currentWeight = filteredData.length > 0 ? filteredData[filteredData.length - 1].value : null;
  const previousWeight = filteredData.length > 1 ? filteredData[filteredData.length - 2].value : null;
  const weightChange = currentWeight && previousWeight ? currentWeight - previousWeight : 0;
  const isTrendingDown = weightChange < 0;
  const isTrendingUp = weightChange > 0;

  // Calculate overall trend (first vs last weight in filtered range)
  const firstWeight = filteredData.length > 0 ? filteredData[0].value : null;
  const overallChange = currentWeight && firstWeight ? currentWeight - firstWeight : 0;
  const overallTrend = overallChange < 0 ? 'down' : overallChange > 0 ? 'up' : 'stable';

  // Get trend icon and color
  const getTrendIcon = () => {
    if (isTrendingDown) return <TrendingDown sx={{ fontSize: '1rem', color: theme.palette.success.main }} />;
    if (isTrendingUp) return <TrendingUp sx={{ fontSize: '1rem', color: theme.palette.error.main }} />;
    return <Remove sx={{ fontSize: '1rem', color: theme.palette.text.secondary }} />;
  };

  const getTrendColor = () => {
    if (isTrendingDown) return theme.palette.success.main;
    if (isTrendingUp) return theme.palette.error.main;
    return theme.palette.text.secondary;
  };

  // Compact tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const weightEntry = payload.find(entry => entry.name === 'Weight');
      const goalEntry = payload.find(entry => entry.name === 'Goal');

      return (
        <Box sx={{
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1.5,
          p: 1.5,
          boxShadow: theme.shadows[4],
          minWidth: 100
        }}>
          <Typography variant="caption" sx={{
            fontWeight: 600,
            color: theme.palette.text.primary,
            fontSize: '0.75rem'
          }}>
            {label}
          </Typography>

          {weightEntry && (
            <Typography variant="caption" sx={{
              color: theme.palette.primary.main,
              fontWeight: 500,
              fontSize: '0.75rem',
              display: 'block',
              mt: 0.5
            }}>
              {weightEntry.value} lbs
            </Typography>
          )}

          {goalEntry && (
            <Typography variant="caption" sx={{
              color: theme.palette.secondary.main,
              fontSize: '0.7rem',
              display: 'block'
            }}>
              Goal: {goalEntry.value.toFixed(1)} lbs
            </Typography>
          )}
        </Box>
      );
    }
    return null;
  };

  const handleTimeRangeChange = (newRange) => {
    setTimeRange(newRange);
  };

  // Auto-switch to better range if current range has insufficient data
  React.useEffect(() => {
    if (!hasEnoughData && filteredData.length > 0) {
      const betterRange = getBestTimeRange(data);
      if (betterRange !== timeRange) {
        setTimeRange(betterRange);
      }
    }
  }, [data, timeRange, hasEnoughData, filteredData.length]);

  return (
    <Card sx={{
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
        {/* Header with current weight and trend */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1.5
        }}>
          <Box>
            <Typography variant="h6" sx={{
              fontWeight: 600,
              color: theme.palette.text.primary,
              fontSize: isMobile ? '1.1rem' : '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}>
              {currentWeight ? `${currentWeight} lbs` : 'No data'}
              {weightChange !== 0 && getTrendIcon()}
            </Typography>

            {weightChange !== 0 && (
              <Typography variant="caption" sx={{
                color: getTrendColor(),
                fontSize: '0.7rem',
                display: 'flex',
                alignItems: 'center',
                gap: 0.25
              }}>
                {Math.abs(weightChange).toFixed(1)} lbs {isTrendingDown ? 'lost' : 'gained'}
              </Typography>
            )}

            {overallChange !== 0 && filteredData.length > 1 && (
              <Typography variant="caption" sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.65rem',
                display: 'block',
                mt: 0.25
              }}>
                Overall: {Math.abs(overallChange).toFixed(1)} lbs {overallTrend === 'down' ? 'lost' : 'gained'}
              </Typography>
            )}
          </Box>

          {goalLine && targetWeight && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.7rem',
                display: 'block'
              }}>
                Target: {targetWeight} lbs
              </Typography>
              {currentWeight && (
                <Typography variant="caption" sx={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.65rem',
                  display: 'block'
                }}>
                  {Math.abs(currentWeight - targetWeight).toFixed(1)} lbs to go
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Time Range Buttons */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 1.5
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
              variant={timeRange === '7' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              7d
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('30')}
              variant={timeRange === '30' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              30d
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('365')}
              variant={timeRange === '365' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              1y
            </Button>
            <Button
              onClick={() => handleTimeRangeChange('all')}
              variant={timeRange === 'all' ? 'contained' : 'outlined'}
              size={isMobile ? 'small' : 'medium'}
            >
              All
            </Button>
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

        {/* Sparkline Chart */}
        <Box sx={{
          width: '100%',
          height: isMobile ? 60 : 80,
          position: 'relative'
        }}>
          <ResponsiveContainer>
            <LineChart data={combinedData}>
              <CartesianGrid
                strokeDasharray="2 2"
                stroke={theme.palette.divider}
                opacity={0.1}
              />

              <XAxis
                dataKey="date"
                stroke={theme.palette.text.secondary}
                fontSize={8}
                tickLine={false}
                axisLine={false}
                tick={{ fill: theme.palette.text.secondary }}
                interval="preserveStartEnd"
                hide={true}
              />

              <YAxis
                stroke={theme.palette.text.secondary}
                fontSize={8}
                tickLine={false}
                axisLine={false}
                tick={{ fill: theme.palette.text.secondary }}
                hide={true}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Goal line - very subtle */}
              {goalLine && startWeight && targetWeight && (
                <Line
                  type="monotone"
                  dataKey="goalValue"
                  stroke={theme.palette.secondary.main}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Goal"
                  opacity={0.4}
                />
              )}

              {/* Weight line */}
              <Line
                type="monotone"
                dataKey="value"
                stroke={theme.palette.primary.main}
                strokeWidth={isMobile ? 2 : 3}
                dot={{
                  fill: theme.palette.primary.main,
                  strokeWidth: 1,
                  r: isMobile ? 1 : 1.5
                }}
                activeDot={{
                  r: isMobile ? 2 : 2.5,
                  stroke: theme.palette.primary.main,
                  strokeWidth: 2
                }}
                name="Weight"
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightSparkline;