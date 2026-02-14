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
import { ResponsiveLine } from '@nivo/line';

const WeightSparklineNivo = ({ data, goalLine, startWeight, targetWeight, startDate, goalDate }) => {
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

  const [timeRangeState, setTimeRangeState] = useState(() => getBestTimeRange(data));

  // Filter data based on selected time range
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sortedData = [...data].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = {
      '7': 7,
      '30': 30,
      '365': 365,
      'all': Infinity
    };

    const daysToSubtract = ranges[timeRangeState];
    const cutoffDate = new Date(mostRecentDate.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));

    const filtered = data
      .filter(item => {
        if (timeRangeState === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date));

    return filtered;
  }, [data, timeRangeState]);

  // Transform data for Nivo
  const chartData = useMemo(() => {
    if (filteredData.length === 0) return [];

    const weightData = filteredData.map(item => ({
      x: new Date(item.log_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
      y: parseFloat(item.weight_value)
    }));

    const result = [
      {
        id: 'weight',
        color: theme.palette.primary.main,
        data: weightData
      }
    ];

    // Add goal line if available
    if (goalLine && startWeight && targetWeight && filteredData.length > 0) {
      const firstDate = new Date(startDate);
      const goalDateObj = new Date(goalDate);
      const firstWeightDataDate = new Date(filteredData[0].log_date);
      const lastWeightDataDate = new Date(filteredData[filteredData.length - 1].log_date);
      goalDateObj.setHours(0, 0, 0, 0);
      firstWeightDataDate.setHours(0, 0, 0, 0);
      lastWeightDataDate.setHours(0, 0, 0, 0);

      const totalWeightLoss = parseFloat(startWeight) - parseFloat(targetWeight);
      const totalDays = (goalDateObj - firstDate) / (1000 * 60 * 60 * 24);
      const dailyWeightLoss = totalDays > 0 ? totalWeightLoss / totalDays : 0;

      const daysFromStartToFirst = (firstWeightDataDate - firstDate) / (1000 * 60 * 60 * 24);
      const daysFromStartToLast = (lastWeightDataDate - firstDate) / (1000 * 60 * 60 * 24);

      const expectedWeightAtFirst = parseFloat(startWeight) - (dailyWeightLoss * daysFromStartToFirst);
      const expectedWeightAtLast = parseFloat(startWeight) - (dailyWeightLoss * daysFromStartToLast);

      const goalData = [
        {
          x: new Date(filteredData[0].log_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }),
          y: expectedWeightAtFirst
        },
        {
          x: new Date(filteredData[filteredData.length - 1].log_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }),
          y: expectedWeightAtLast
        }
      ];

      result.push({
        id: 'goal',
        color: theme.palette.secondary.main,
        data: goalData
      });
    }

    return result;
  }, [filteredData, goalLine, startWeight, targetWeight, theme.palette]);

  // Get current and previous weights for trend calculation
  const currentWeight = filteredData.length > 0 ? filteredData[filteredData.length - 1].weight_value : null;
  const previousWeight = filteredData.length > 1 ? filteredData[filteredData.length - 2].weight_value : null;
  const weightChange = currentWeight && previousWeight ? currentWeight - previousWeight : 0;
  const isTrendingDown = weightChange < 0;
  const isTrendingUp = weightChange > 0;

  // Calculate overall trend (first vs last weight in filtered range)
  const firstWeight = filteredData.length > 0 ? filteredData[0].weight_value : null;
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

  const handleTimeRangeChange = (newRange) => {
    setTimeRangeState(newRange);
  };

  // Auto-switch to better range if current range has insufficient data
  React.useEffect(() => {
    if (filteredData.length < 2 && filteredData.length > 0) {
      const betterRange = getBestTimeRange(data);
      if (betterRange !== timeRangeState) {
        setTimeRangeState(betterRange);
      }
    }
  }, [data, timeRangeState, filteredData.length]);

  // Check if we have enough data points for the selected range
  const hasEnoughData = filteredData.length >= 2;
  const insufficientDataMessage = !hasEnoughData && filteredData.length > 0 ?
    `Only ${filteredData.length} data point${filteredData.length === 1 ? '' : 's'} in this range. Try a larger time range.` : null;

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
          {chartData.length > 0 ? (
            <ResponsiveLine
              data={chartData}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              xScale={{ type: 'point' }}
              yScale={{
                type: 'linear',
                min: 'auto',
                max: 'auto',
                stacked: false
              }}
              axisTop={null}
              axisRight={null}
              axisBottom={null}
              axisLeft={null}
              enableGridX={false}
              enableGridY={false}
              enablePoints={true}
              pointSize={isMobile ? 2 : 3}
              pointColor={{ theme: 'background' }}
              pointBorderWidth={2}
              pointBorderColor={{ from: 'serieColor' }}
              pointLabelYOffset={-12}
              enableArea={false}
              useMesh={true}
                                            enableSlices={false}
               tooltip={({ point }) => {
                 // Find the corresponding weight point for the same date
                 const weightPoint = chartData.find(serie => serie.id === 'weight')?.data.find(d => d.x === point.data.x);
                 const goalPoint = chartData.find(serie => serie.id === 'goal')?.data.find(d => d.x === point.data.x);

                 return (
                   <div style={{
                     backgroundColor: theme.palette.background.paper,
                     border: `1px solid ${theme.palette.divider}`,
                     borderRadius: 6,
                     padding: 12,
                     boxShadow: theme.shadows[4],
                     minWidth: 120,
                     color: theme.palette.text.primary,
                     fontSize: '12px'
                   }}>
                     <div style={{ fontWeight: 600, marginBottom: 4 }}>
                       {point?.data?.x || 'Unknown Date'}
                     </div>
                     {weightPoint && (
                       <div style={{ color: theme.palette.primary.main, fontWeight: 500, marginBottom: 2 }}>
                         Weight: {weightPoint.y.toFixed(1)} lbs
                       </div>
                     )}
                     {goalPoint && (
                       <div style={{ color: theme.palette.secondary.main, fontWeight: 500 }}>
                         Goal: {goalPoint.y.toFixed(1)} lbs
                       </div>
                     )}
                   </div>
                 );
               }}
              theme={{
                axis: {
                  ticks: {
                    text: {
                      fill: theme.palette.text.secondary,
                      fontSize: 8
                    }
                  }
                },
                grid: {
                  line: {
                    stroke: theme.palette.divider,
                    strokeWidth: 1,
                    opacity: 0.1
                  }
                },
                tooltip: {
                  container: {
                    background: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    fontSize: 12,
                    borderRadius: 4,
                    boxShadow: theme.shadows[4]
                  }
                }
              }}
              colors={chartData.map(serie => serie.color)}
              lineWidth={isMobile ? 2 : 3}
              curve="monotoneX"
            />
          ) : (
            <Box sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: theme.palette.text.secondary
            }}>
              <Typography variant="caption">
                No data available
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightSparklineNivo;