import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { format, parseISO, eachWeekOfInterval, addWeeks, differenceInWeeks } from 'date-fns';
import {
  TrendingDown as GoalIcon,
  ShowChart as ActualIcon,
  Timeline as ProjectionIcon
} from '@mui/icons-material';

const WeightTimeline = ({
  weightLogs = [],
  goal = null,
  unit = 'lbs'
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const chartData = useMemo(() => {
    if (!goal || !goal.enabled) {
      // No goal - just show actual weights
      const validLogs = weightLogs.filter(log => log.log_date && log.weight_value != null);
      if (validLogs.length === 0) {
        return [];
      }

      return [{
        id: 'Actual Weight',
        color: theme.palette.primary.main,
        data: validLogs.map(log => ({
          x: log.log_date,
          y: log.weight_value
        }))
      }];
    }

    // Validate goal has required dates
    if (!goal.startDate || !goal.goalDate || !goal.startWeight || !goal.targetWeight) {
      return [];
    }

    try {
      const lines = [];
      const startDate = parseISO(goal.startDate);
      const goalDate = parseISO(goal.goalDate);
      const today = new Date();

      // Validate parsed dates
      if (isNaN(startDate.getTime()) || isNaN(goalDate.getTime())) {
        return [];
      }

    // 1. Goal Line (linear projection from start to target)
    const goalLineData = [
      { x: format(startDate, 'yyyy-MM-dd'), y: goal.startWeight },
      { x: format(goalDate, 'yyyy-MM-dd'), y: goal.targetWeight }
    ];

    lines.push({
      id: 'Goal',
      color: theme.palette.text.secondary,
      data: goalLineData
    });

    // 2. Actual Weight Line
    if (weightLogs.length > 0) {
      const actualData = weightLogs
        .filter(log => {
          if (!log.log_date || log.weight_value == null) return false;
          try {
            const logDate = parseISO(log.log_date);
            if (isNaN(logDate.getTime())) return false;
            return logDate >= startDate && logDate <= goalDate;
          } catch {
            return false;
          }
        })
        .map(log => ({
          x: format(parseISO(log.log_date), 'yyyy-MM-dd'), // Convert to consistent format
          y: log.weight_value
        }))
        .sort((a, b) => new Date(a.x) - new Date(b.x));

      if (actualData.length > 0) {
        lines.push({
          id: 'Actual',
          color: theme.palette.primary.main,
          data: actualData
        });

        // 3. Projection Line (based on current trend)
        if (actualData.length >= 2) {
          const recentLogs = actualData.slice(-4); // Use last 4 weeks for trend
          const firstLog = recentLogs[0];
          const lastLog = recentLogs[recentLogs.length - 1];

          const firstDate = parseISO(firstLog.x);
          const lastDate = parseISO(lastLog.x);
          const weeksDiff = differenceInWeeks(lastDate, firstDate) || 1;

          const weightChange = lastLog.y - firstLog.y;
          const currentRate = weightChange / weeksDiff;

          // Project from current weight to goal date
          const currentWeight = lastLog.y;
          const weeksToGoal = differenceInWeeks(goalDate, today);
          const projectedWeight = currentWeight + (currentRate * weeksToGoal);

          const projectionData = [
            { x: format(today, 'yyyy-MM-dd'), y: currentWeight },
            { x: format(goalDate, 'yyyy-MM-dd'), y: projectedWeight }
          ];

          lines.push({
            id: 'Projection',
            color: currentRate * goal.ratePerWeek > 0 ? '#10b981' : '#ef4444',
            data: projectionData
          });
        }
      }
    }

    return lines;
    } catch (error) {
      console.error('Error generating timeline chart data:', error);
      return [];
    }
  }, [weightLogs, goal, unit]);

  // Calculate min/max for Y axis
  const yAxisDomain = useMemo(() => {
    if (!goal || chartData.length === 0) return ['auto', 'auto'];

    const allYValues = chartData.flatMap(line => line.data.map(point => point.y));
    const min = Math.min(...allYValues, goal.targetWeight, goal.startWeight);
    const max = Math.max(...allYValues, goal.targetWeight, goal.startWeight);
    const padding = (max - min) * 0.1;

    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData, goal]);

  const hasValidData = chartData.length > 0 && chartData.some(line =>
    line.data && line.data.length > 0 && line.data.every(point =>
      point.x && point.y != null && !isNaN(new Date(point.x).getTime())
    )
  );

  if (!hasValidData) {

    return (
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${theme.palette.divider}`
      }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
            No weight data to display
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.disabled }}>
            Add your first weight entry to see your progress timeline
          </Typography>
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
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 1 }}>
            Weight Timeline
          </Typography>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {chartData.map(line => (
              <Box key={line.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: line.id === 'Goal' ? `2px dashed ${theme.palette.text.secondary}` : 'none',
                  backgroundColor: line.id === 'Goal' ? 'transparent' : line.color
                }} />
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                  {line.id}
                  {line.id === 'Projection' && (
                    <Typography component="span" variant="caption" sx={{
                      ml: 0.5,
                      color: line.color,
                      fontWeight: 700
                    }}>
                      ({line.color === '#10b981' ? 'On Track' : 'Off Track'})
                    </Typography>
                  )}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Chart */}
        <Box sx={{ height: 400 }}>
          <ResponsiveLine
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
            xScale={{
              type: 'time',
              format: '%Y-%m-%d',
              useUTC: false,
              precision: 'day'
            }}
            xFormat="time:%Y-%m-%d"
            yScale={{
              type: 'linear',
              min: yAxisDomain[0],
              max: yAxisDomain[1]
            }}
            axisBottom={{
              format: '%b %d',
              tickRotation: -45,
              legend: 'Date',
              legendOffset: 50,
              legendPosition: 'middle',
              tickSize: 5,
              tickPadding: 5
            }}
            axisLeft={{
              legend: `Weight (${unit})`,
              legendOffset: -50,
              legendPosition: 'middle',
              tickSize: 5,
              tickPadding: 5
            }}
            colors={line => line.color}
            pointSize={line => line.id === 'Actual' ? 8 : 0}
            pointColor="#ffffff"
            pointBorderWidth={2}
            pointBorderColor={line => line.color}
            enablePointLabel={false}
            useMesh={true}
            curve="monotoneX"
            lineWidth={line => line.id === 'Goal' ? 2 : 3}
            enableArea={false}
            areaOpacity={0.1}
            enableSlices="x"
            sliceTooltip={({ slice }) => (
              <Box sx={{
                background: theme.palette.background.paper,
                padding: '12px 16px',
                borderRadius: '12px',
                boxShadow: theme.shadows[3],
                border: `1px solid ${theme.palette.divider}`
              }}>
                <Typography variant="caption" sx={{
                  fontWeight: 700,
                  color: theme.palette.text.primary,
                  display: 'block',
                  mb: 1
                }}>
                  {format(parseISO(slice.points[0].data.xFormatted), 'MMM dd, yyyy')}
                </Typography>
                {slice.points.map(point => (
                  <Box key={point.id} sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 0.5
                  }}>
                    <Box sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: point.serieColor
                    }} />
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                      {point.serieId}:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                      {point.data.yFormatted} {unit}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            theme={{
              axis: {
                ticks: {
                  text: {
                    fill: isDark ? theme.palette.text.secondary : theme.palette.text.secondary,
                    fontSize: 11
                  }
                },
                legend: {
                  text: {
                    fill: isDark ? theme.palette.text.primary : theme.palette.text.primary,
                    fontSize: 12,
                    fontWeight: 600
                  }
                }
              },
              grid: {
                line: {
                  stroke: isDark ? 'rgba(255,255,255,0.1)' : theme.palette.divider,
                  strokeWidth: 1
                }
              }
            }}
            layers={[
              'grid',
              'markers',
              'axes',
              'areas',
              ({ lineGenerator, series }) => {
                // Custom layer to render goal line as dashed
                return series.map(({ id, data, color }) => {
                  if (id === 'Goal') {
                    const lineData = lineGenerator(data.map(d => d.position));
                    return (
                      <path
                        key={id}
                        d={lineData}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        style={{ opacity: 0.6 }}
                      />
                    );
                  }
                  return null;
                });
              },
              'lines',
              'points',
              'slices',
              'mesh',
              'legends'
            ]}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightTimeline;
