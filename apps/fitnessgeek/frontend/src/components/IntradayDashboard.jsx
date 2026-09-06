import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  useTheme
} from '@mui/material';
import { influxService } from '../services/influxService';
import {
  FavoriteBorder as HeartIcon,
  Psychology as StressIcon,
  BatteryChargingFull as BatteryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { ResponsiveLine } from '@nivo/line';
import { buildChartTheme } from './primitives/chartTheme.js';
import {
  toTimeSeries,
  formatClockTime,
  normalizeIntraday,
  EMPTY_INTRADAY,
} from './intradaySeries.js';

/**
 * Sparkline chart component
 *
 * Q52a: ported from chart.js/react-chartjs-2 to @nivo/line, the one chart
 * library this app now ships. Same shape — a filled, smoothed 2px line with
 * no axes and a hover readout of "HH:MM / value".
 */
function SparklineChart({ data, color, height = 60, showGradient = true }) {
  const theme = useTheme();
  const chartTheme = React.useMemo(() => buildChartTheme(theme), [theme]);
  const series = React.useMemo(() => toTimeSeries(data, 'value', color), [data, color]);

  if (series.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.secondary">No data</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height }}>
      <ResponsiveLine
        data={series}
        theme={chartTheme}
        role="img"
        ariaLabel={`Trend sparkline, ${series[0].data.length} readings`}
        margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
        xScale={{ type: 'time', format: 'native', useUTC: false }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisTop={null}
        axisRight={null}
        axisBottom={null}
        axisLeft={null}
        enableGridX={false}
        enableGridY={false}
        colors={(line) => line.color}
        curve="monotoneX"
        lineWidth={2}
        enablePoints={false}
        enableArea={showGradient}
        areaOpacity={0.2}
        useMesh
        tooltip={({ point }) => (
          <Box sx={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px',
            px: 1.25,
            py: 0.75,
            boxShadow: theme.shadows[3],
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatClockTime(point.data.x)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {point.data.y}
            </Typography>
          </Box>
        )}
      />
    </Box>
  );
}

/**
 * Metric card with current value and sparkline
 */
function MetricCardWithChart({
  icon,
  label,
  currentValue,
  unit,
  data,
  color,
  trend = null,
  target = null,
  tooltipText = ''
}) {
  const theme = useTheme();

  // Calculate trend if not provided
  const calculatedTrend = trend !== null ? trend : (() => {
    if (!data || data.length < 2) return null;
    const recent = data.slice(-10);
    const older = data.slice(-20, -10);
    if (older.length === 0) return null;
    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;
    return recentAvg - olderAvg;
  })();

  return (
    <Tooltip title={tooltipText} arrow>
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Stack spacing={1}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack direction="row" spacing={1} alignItems="center">
                {React.cloneElement(icon, { sx: { color } })}
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
              </Stack>
              {calculatedTrend !== null && calculatedTrend !== 0 && (
                <Chip
                  icon={calculatedTrend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                  label={Math.abs(Math.round(calculatedTrend))}
                  size="small"
                  color={calculatedTrend > 0 ? 'error' : 'success'}
                  variant="outlined"
                />
              )}
            </Stack>

            {/* Current Value */}
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="h3" component="div" sx={{ color, fontWeight: 'bold' }}>
                {currentValue}
              </Typography>
              {unit && (
                <Typography variant="body1" color="text.secondary">
                  {unit}
                </Typography>
              )}
            </Stack>

            {/* Target indicator */}
            {target && (
              <Typography variant="caption" color="text.secondary">
                Target: {target}
              </Typography>
            )}

            {/* Sparkline */}
            <SparklineChart data={data} color={color} height={50} />
          </Stack>
        </CardContent>
      </Card>
    </Tooltip>
  );
}

/**
 * Full chart with time axis
 */
function DetailedChart({ data, label, color, yAxisLabel, height = 200 }) {
  const theme = useTheme();
  const chartTheme = React.useMemo(() => buildChartTheme(theme), [theme]);
  const series = React.useMemo(() => toTimeSeries(data, label, color), [data, label, color]);

  if (series.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height }}>
      <ResponsiveLine
        data={series}
        theme={chartTheme}
        role="img"
        ariaLabel={`${label} through the day${yAxisLabel ? `, in ${yAxisLabel}` : ''}`}
        margin={{ top: 12, right: 16, bottom: 40, left: 56 }}
        xScale={{ type: 'time', format: 'native', useUTC: false }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisBottom={{
          format: '%H:%M',
          tickSize: 0,
          tickPadding: 10,
          tickValues: 5,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          tickValues: 5,
          format: (v) => (yAxisLabel ? `${v} ${yAxisLabel}` : `${v}`),
        }}
        enableGridX={false}
        colors={(line) => line.color}
        curve="monotoneX"
        lineWidth={2}
        pointSize={3}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={1}
        pointBorderColor={{ from: 'serieColor' }}
        enableArea
        areaOpacity={0.13}
        useMesh
        enableSlices="x"
        sliceTooltip={({ slice }) => (
          <Box sx={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px',
            px: 1.5,
            py: 1,
            boxShadow: theme.shadows[3],
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatClockTime(slice.points[0].data.x, { withDate: true })}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {label}: {slice.points[0].data.y}{yAxisLabel ? ` ${yAxisLabel}` : ''}
            </Typography>
          </Box>
        )}
      />
    </Box>
  );
}

/**
 * Main IntradayDashboard component
 */
export default function IntradayDashboard({
  date,
  onDateChange
}) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    heartRate: [],
    stress: [],
    bodyBattery: [],
    breathing: []
  });
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'detailed'

  useEffect(() => {
    if (!date) return;

    async function fetchData() {
      setLoading(true);

      try {
        const response = await influxService.getIntraday(date, date);

        // Backend returns { available: false, reason, message } when InfluxDB is
        // unavailable or has no data for this date — treat as empty, not an error.
        if (!response || response.available === false) {
          setData(EMPTY_INTRADAY);
        } else {
          // The measurement-column → `value` rename now lives in
          // `intradaySeries.js`, shared with MealImpactVisualization.
          setData(normalizeIntraday(response));
        }
      } catch (err) {
        // Defensive: backend should no longer 500, but handle it quietly.
        console.warn('Intraday health data unavailable:', err.message);
        setData(EMPTY_INTRADAY);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [date]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Calculate current values (most recent data point)
  const currentHR = data.heartRate.length > 0
    ? data.heartRate[data.heartRate.length - 1].value
    : 0;
  const currentStress = data.stress.length > 0
    ? data.stress[data.stress.length - 1].value
    : 0;
  const currentBattery = data.bodyBattery.length > 0
    ? data.bodyBattery[data.bodyBattery.length - 1].value
    : 0;

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <MetricCardWithChart
            icon={<HeartIcon />}
            label="Heart Rate"
            currentValue={currentHR}
            unit="bpm"
            data={data.heartRate}
            color={theme.palette.error.main}
            tooltipText="Real-time heart rate from your Garmin device"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <MetricCardWithChart
            icon={<StressIcon />}
            label="Stress Level"
            currentValue={currentStress}
            unit="/100"
            data={data.stress}
            color={theme.palette.warning.main}
            target="< 40"
            tooltipText="Stress score based on HRV (0-100, lower is better)"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <MetricCardWithChart
            icon={<BatteryIcon />}
            label="Body Battery"
            currentValue={currentBattery}
            unit="/100"
            data={data.bodyBattery}
            color={theme.palette.success.main}
            tooltipText="Energy reserves (charged during rest, depleted during activity/stress)"
          />
        </Grid>
      </Grid>

      {/* Detailed Charts */}
      {viewMode === 'detailed' && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Heart Rate Trend</Typography>
                <DetailedChart
                  data={data.heartRate}
                  label="Heart Rate"
                  color={theme.palette.error.main}
                  yAxisLabel="bpm"
                  height={250}
                />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Stress Pattern</Typography>
                <DetailedChart
                  data={data.stress}
                  label="Stress"
                  color={theme.palette.warning.main}
                  yAxisLabel=""
                  height={200}
                />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Body Battery</Typography>
                <DetailedChart
                  data={data.bodyBattery}
                  label="Energy"
                  color={theme.palette.success.main}
                  yAxisLabel=""
                  height={200}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Toggle View Button */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Chip
          label={viewMode === 'summary' ? 'Show Detailed Charts' : 'Show Summary Only'}
          onClick={() => setViewMode(viewMode === 'summary' ? 'detailed' : 'summary')}
          clickable
          color="primary"
        />
      </Box>
    </Box>
  );
}
