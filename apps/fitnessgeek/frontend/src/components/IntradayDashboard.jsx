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
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

/**
 * Sparkline chart component
 */
function SparklineChart({ data, color, height = 60, showGradient = true }) {
  const theme = useTheme();

  if (!data || data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.secondary">No data</Typography>
      </Box>
    );
  }

  const chartData = {
    labels: data.map(d => d.time),
    datasets: [{
      data: data.map(d => d.value),
      borderColor: color,
      backgroundColor: showGradient ? `${color}33` : 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: showGradient,
      tension: 0.4
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (context) => {
            const date = new Date(context[0].label);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          },
          label: (context) => `${context.parsed.y}`
        }
      }
    },
    scales: {
      x: { display: false },
      y: { display: false }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <Box sx={{ height }}>
      <Line data={chartData} options={options} />
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

  if (!data || data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data available</Typography>
      </Box>
    );
  }

  const chartData = {
    labels: data.map(d => d.time),
    datasets: [{
      label,
      data: data.map(d => d.value),
      borderColor: color,
      backgroundColor: `${color}22`,
      borderWidth: 2,
      pointRadius: 1,
      pointHoverRadius: 5,
      fill: true,
      tension: 0.4
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (context) => {
            const date = new Date(context[0].label);
            return date.toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          },
          label: (context) => `${label}: ${context.parsed.y} ${yAxisLabel}`
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm'
          }
        },
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: false,
        grid: {
          color: theme.palette.divider
        },
        ticks: {
          callback: (value) => `${value} ${yAxisLabel}`
        }
      }
    }
  };

  return (
    <Box sx={{ height }}>
      <Line data={chartData} options={options} />
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
          setData({ heartRate: [], stress: [], bodyBattery: [], breathing: [] });
        } else {
          // Transform data for charts
          const transformedData = {
            heartRate: (response.heartRate || []).map(point => ({
              time: point.time,
              value: point.HeartRate
            })),
            stress: (response.stress || []).map(point => ({
              time: point.time,
              value: point.stressLevel
            })),
            bodyBattery: (response.bodyBattery || []).map(point => ({
              time: point.time,
              value: point.BodyBatteryLevel
            })),
            breathing: (response.breathing || []).map(point => ({
              time: point.time,
              value: point.BreathingRate
            }))
          };
          setData(transformedData);
        }
      } catch (err) {
        // Defensive: backend should no longer 500, but handle it quietly.
        console.warn('Intraday health data unavailable:', err.message);
        setData({ heartRate: [], stress: [], bodyBattery: [], breathing: [] });
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
