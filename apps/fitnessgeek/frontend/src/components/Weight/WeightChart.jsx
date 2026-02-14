import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const WeightChart = ({ data, yAxisLabel, goalLine, startWeight, targetWeight }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Format data for chart and sort by date (oldest to newest)
  const chartData = data
    .map(item => ({
      date: new Date(item.log_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
      value: parseFloat(item.weight_value),
      fullDate: item.log_date
    }))
    .sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

  // Create goal line data that spans the actual date range
  let combinedData = [...chartData];

  if (goalLine && startWeight && targetWeight && chartData.length > 0) {
    const firstDate = new Date(chartData[0].fullDate);
    const lastDate = new Date(chartData[chartData.length - 1].fullDate);

    const totalWeightLoss = parseFloat(startWeight) - parseFloat(targetWeight);
    const totalDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const dailyWeightLoss = totalWeightLoss / totalDays;

    chartData.forEach((dataPoint, index) => {
      const currentDate = new Date(dataPoint.fullDate);
      const daysFromStart = (currentDate - firstDate) / (1000 * 60 * 60 * 24);
      const expectedWeight = parseFloat(startWeight) - (dailyWeightLoss * daysFromStart);

      combinedData[index].goalValue = expectedWeight;
    });

    combinedData.forEach((dataPoint, index) => {
      combinedData[index].targetLine = parseFloat(targetWeight);
    });
  }

  // Enhanced tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const weightEntry = payload.find(entry => entry.name === 'Weight');
      const goalEntry = payload.find(entry => entry.name === 'Goal');
      const targetEntry = payload.find(entry => entry.name === 'Target');

      return (
        <Box sx={{
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          p: 2,
          boxShadow: theme.shadows[8],
          minWidth: 140
        }}>
          <Typography variant="body2" sx={{
            fontWeight: 600,
            mb: 1,
            color: theme.palette.text.primary,
            fontSize: isMobile ? '0.875rem' : '1rem'
          }}>
            {label}
          </Typography>

          {weightEntry && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box sx={{
                width: 12,
                height: 3,
                backgroundColor: theme.palette.primary.main,
                borderRadius: 1.5,
                mr: 1
              }} />
              <Typography variant="body2" sx={{
                color: theme.palette.primary.main,
                fontWeight: 500,
                fontSize: isMobile ? '0.75rem' : '0.875rem'
              }}>
                Current: {weightEntry.value} lbs
              </Typography>
            </Box>
          )}

          {goalEntry && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box sx={{
                width: 12,
                height: 2,
                backgroundColor: theme.palette.secondary.main,
                borderRadius: 1,
                mr: 1,
                border: `1px dashed ${theme.palette.secondary.main}`
              }} />
              <Typography variant="body2" sx={{
                color: theme.palette.secondary.main,
                fontSize: isMobile ? '0.75rem' : '0.875rem'
              }}>
                Goal: {goalEntry.value.toFixed(1)} lbs
              </Typography>
            </Box>
          )}

          {targetEntry && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{
                width: 12,
                height: 1,
                backgroundColor: theme.palette.secondary.main,
                borderRadius: 0.5,
                mr: 1
              }} />
              <Typography variant="body2" sx={{
                color: theme.palette.text.secondary,
                fontSize: isMobile ? '0.75rem' : '0.875rem'
              }}>
                Target: {targetEntry.value} lbs
              </Typography>
            </Box>
          )}
        </Box>
      );
    }
    return null;
  };

  return (
    <Card sx={{
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{
          width: '100%',
          height: isMobile ? 200 : 250,
          position: 'relative'
        }}>
          <ResponsiveContainer>
            <AreaChart data={combinedData}>
              <defs>
                <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.1}/>
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.palette.divider}
                opacity={0.2}
              />

              <XAxis
                dataKey="date"
                stroke={theme.palette.text.secondary}
                fontSize={isMobile ? 9 : 10}
                tickLine={false}
                axisLine={false}
                tick={{ fill: theme.palette.text.secondary }}
                interval="preserveStartEnd"
              />

              <YAxis
                stroke={theme.palette.text.secondary}
                fontSize={isMobile ? 9 : 10}
                tickLine={false}
                axisLine={false}
                tick={{ fill: theme.palette.text.secondary }}
                label={{
                  value: yAxisLabel,
                  angle: -90,
                  position: 'insideLeft',
                  style: {
                    textAnchor: 'middle',
                    fontSize: isMobile ? 9 : 10,
                    fill: theme.palette.text.secondary
                  }
                }}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Target weight line - horizontal line */}
              {goalLine && targetWeight && (
                <Line
                  type="monotone"
                  dataKey="targetLine"
                  stroke={theme.palette.secondary.main}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Target"
                />
              )}

              {/* Goal line */}
              {goalLine && startWeight && targetWeight && (
                <Line
                  type="monotone"
                  dataKey="goalValue"
                  stroke={theme.palette.secondary.main}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{
                    fill: theme.palette.secondary.main,
                    strokeWidth: 2,
                    r: isMobile ? 2 : 3
                  }}
                  activeDot={{
                    r: isMobile ? 3 : 4,
                    stroke: theme.palette.secondary.main,
                    strokeWidth: 2
                  }}
                  name="Goal"
                />
              )}

              {/* Weight area - render last so it's on top */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={theme.palette.primary.main}
                strokeWidth={isMobile ? 2 : 3}
                fill="url(#weightGradient)"
                dot={{
                  fill: theme.palette.primary.main,
                  strokeWidth: 2,
                  r: isMobile ? 2 : 3
                }}
                activeDot={{
                  r: isMobile ? 3 : 4,
                  stroke: theme.palette.primary.main,
                  strokeWidth: 2
                }}
                name="Weight"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightChart;
