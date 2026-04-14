import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { format, parseISO, differenceInWeeks } from 'date-fns';
import { Surface, SectionLabel, DisplayHeading, buildChartTheme } from '../primitives';

const WeightTimeline = ({ weightLogs = [], goal = null, unit = 'lbs' }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const muted = theme.palette.text.secondary;
  const ink = theme.palette.text.primary;
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);

  const chartData = useMemo(() => {
    if (!goal || !goal.enabled) {
      const validLogs = weightLogs.filter((log) => log.log_date && log.weight_value != null);
      if (validLogs.length === 0) return [];
      return [
        {
          id: 'Actual',
          color: primary,
          data: validLogs.map((log) => ({ x: log.log_date, y: log.weight_value })),
        },
      ];
    }

    if (!goal.startDate || !goal.goalDate || !goal.startWeight || !goal.targetWeight) return [];

    try {
      const lines = [];
      const startDate = parseISO(goal.startDate);
      const goalDate = parseISO(goal.goalDate);
      const today = new Date();
      if (isNaN(startDate.getTime()) || isNaN(goalDate.getTime())) return [];

      // Goal line
      lines.push({
        id: 'Goal',
        color: muted,
        data: [
          { x: format(startDate, 'yyyy-MM-dd'), y: goal.startWeight },
          { x: format(goalDate, 'yyyy-MM-dd'), y: goal.targetWeight },
        ],
      });

      // Actual weight line
      if (weightLogs.length > 0) {
        const actualData = weightLogs
          .filter((log) => {
            if (!log.log_date || log.weight_value == null) return false;
            try {
              const logDate = parseISO(log.log_date);
              if (isNaN(logDate.getTime())) return false;
              return logDate >= startDate && logDate <= goalDate;
            } catch {
              return false;
            }
          })
          .map((log) => ({
            x: format(parseISO(log.log_date), 'yyyy-MM-dd'),
            y: log.weight_value,
          }))
          .sort((a, b) => new Date(a.x) - new Date(b.x));

        if (actualData.length > 0) {
          lines.push({ id: 'Actual', color: primary, data: actualData });

          // Projection line
          if (actualData.length >= 2) {
            const recentLogs = actualData.slice(-4);
            const firstLog = recentLogs[0];
            const lastLog = recentLogs[recentLogs.length - 1];
            const firstDate = parseISO(firstLog.x);
            const lastDate = parseISO(lastLog.x);
            const weeksDiff = differenceInWeeks(lastDate, firstDate) || 1;
            const weightChange = lastLog.y - firstLog.y;
            const currentRate = weightChange / weeksDiff;
            const currentWeight = lastLog.y;
            const weeksToGoal = differenceInWeeks(goalDate, today);
            const projectedWeight = currentWeight + currentRate * weeksToGoal;

            const isOnTrack = currentRate * goal.ratePerWeek > 0;
            lines.push({
              id: 'Projection',
              color: isOnTrack ? theme.palette.success.main : theme.palette.warning.main,
              data: [
                { x: format(today, 'yyyy-MM-dd'), y: currentWeight },
                { x: format(goalDate, 'yyyy-MM-dd'), y: projectedWeight },
              ],
            });
          }
        }
      }

      return lines;
    } catch (error) {
      console.error('Error generating timeline chart data:', error);
      return [];
    }
  }, [weightLogs, goal, unit, primary, muted, theme]);

  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'];
    const allYValues = chartData.flatMap((line) => line.data.map((point) => point.y));
    if (goal) {
      allYValues.push(goal.targetWeight, goal.startWeight);
    }
    const min = Math.min(...allYValues);
    const max = Math.max(...allYValues);
    const padding = (max - min) * 0.12 || 2;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData, goal]);

  const hasValidData =
    chartData.length > 0 &&
    chartData.some(
      (line) =>
        line.data?.length > 0 &&
        line.data.every(
          (point) => point.x && point.y != null && !isNaN(new Date(point.x).getTime())
        )
    );

  if (!hasValidData) {
    return (
      <Surface sx={{ textAlign: 'center', py: 5 }}>
        <SectionLabel sx={{ justifyContent: 'center', mb: 1.5 }}>Weight Timeline</SectionLabel>
        <Typography sx={{ color: muted, fontSize: '0.875rem' }}>
          No weight data to display yet.
        </Typography>
        <Typography sx={{ color: 'text.disabled', fontSize: '0.75rem', mt: 0.5 }}>
          Log your first weight entry to see your progress curve.
        </Typography>
      </Surface>
    );
  }

  // Legend item component — matches the SectionLabel tick aesthetic
  const LegendItem = ({ color, label, isDashed, suffix }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 14,
          height: isDashed ? 0 : 2,
          borderTop: isDashed ? `2px dashed ${color}` : 'none',
          backgroundColor: isDashed ? 'transparent' : color,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontSize: '0.625rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: muted,
        }}
      >
        {label}
      </Typography>
      {suffix && (
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: suffix.color,
          }}
        >
          · {suffix.label}
        </Typography>
      )}
    </Box>
  );

  return (
    <Surface>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 2.5,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <SectionLabel sx={{ mb: 0.75 }}>Weight Timeline</SectionLabel>
          <DisplayHeading size="card">Your curve</DisplayHeading>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {chartData.map((line) => {
            const isGoal = line.id === 'Goal';
            const isProjection = line.id === 'Projection';
            const suffix = isProjection
              ? {
                  label: line.color === theme.palette.success.main ? 'On Track' : 'Off Track',
                  color: line.color,
                }
              : null;
            return (
              <LegendItem
                key={line.id}
                color={line.color}
                label={line.id}
                isDashed={isGoal}
                suffix={suffix}
              />
            );
          })}
        </Box>
      </Box>

      {/* Chart */}
      <Box sx={{ height: 360 }}>
        <ResponsiveLine
          data={chartData}
          theme={chartTheme}
          margin={{ top: 12, right: 16, bottom: 44, left: 40 }}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
          xFormat="time:%Y-%m-%d"
          yScale={{ type: 'linear', min: yAxisDomain[0], max: yAxisDomain[1] }}
          axisBottom={{
            format: '%b %d',
            tickRotation: 0,
            tickSize: 0,
            tickPadding: 12,
            tickValues: 5,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            tickValues: 5,
            format: (v) => `${Math.round(v)}`,
          }}
          colors={(line) => line.color}
          pointSize={(line) => (line.id === 'Actual' ? 6 : 0)}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          pointBorderColor={(line) => line.color}
          enablePointLabel={false}
          useMesh
          curve="monotoneX"
          lineWidth={(line) => (line.id === 'Goal' ? 2 : 2.5)}
          enableArea={false}
          enableSlices="x"
          enableGridX={false}
          sliceTooltip={({ slice }) => (
            <Box
              sx={{
                background: theme.palette.background.paper,
                px: 1.75,
                py: 1.25,
                borderRadius: 1.5,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.shadows[4],
                minWidth: 160,
              }}
            >
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: muted,
                  mb: 0.75,
                  display: 'block',
                }}
              >
                {format(parseISO(slice.points[0].data.xFormatted), 'MMM dd, yyyy')}
              </Typography>
              {slice.points.map((point) => (
                <Box
                  key={point.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    mb: 0.25,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: point.serieColor,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        color: muted,
                        fontWeight: 600,
                      }}
                    >
                      {point.serieId}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: ink,
                    }}
                  >
                    {Number(point.data.yFormatted).toFixed(1)} {unit}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          layers={[
            'grid',
            'markers',
            'axes',
            'areas',
            // Custom dashed layer for Goal line
            ({ lineGenerator, series }) =>
              series.map(({ id, data, color }) => {
                if (id === 'Goal') {
                  const lineData = lineGenerator(data.map((d) => d.position));
                  return (
                    <path
                      key={id}
                      d={lineData}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                      style={{ opacity: 0.55 }}
                    />
                  );
                }
                return null;
              }),
            'lines',
            'points',
            'slices',
            'mesh',
          ]}
        />
      </Box>
    </Surface>
  );
};

export default WeightTimeline;
