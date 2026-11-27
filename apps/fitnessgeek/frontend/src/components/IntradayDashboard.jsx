import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Tooltip,
  useTheme
} from '@mui/material';
import { influxService } from '../services/influxService';
import { ResponsiveLine } from '@nivo/line';
import { LabelPanel, FactHeadline } from './primitives';
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
 *
 * The Label: one colour system. The measured line is the app's blue; the
 * fill under it is a 10% tint of the same blue; nothing else is coloured.
 */
function SparklineChart({ data, color, height = 60, showGradient = true }) {
  const theme = useTheme();
  const chartTheme = React.useMemo(() => buildChartTheme(theme), [theme]);
  const series = React.useMemo(() => toTimeSeries(data, 'value', color), [data, color]);

  if (series.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" color="text.secondary">No readings</Typography>
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
        areaOpacity={0.1}
        useMesh
        tooltip={({ point }) => (
          <Box sx={{
            backgroundColor: theme.palette.background.paper,
            border: `2px solid ${theme.palette.text.primary}`,
            px: 1.25,
            py: 0.75,
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatClockTime(point.data.x)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
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
  label,
  currentValue,
  unit,
  data,
  color,
  target = null,
  tooltipText = ''
}) {
  /*
   * A "trend" chip lived here. It compared the last ten data points with the
   * ten before them — on an INTRADAY series, so it measured the last few
   * minutes against the few before, and showed the difference as a bare
   * number with an arrow beside a card that reads as the day's figure. It was
   * coloured red for any rise, which is backwards for body battery. It is
   * gone rather than fixed: a like-for-like day-over-day comparison needs a
   * second day's data, and a number with no stated window is worse than none.
   */
  const latest = data && data.length > 0 ? data[data.length - 1] : null;
  const asOf = latest ? formatClockTime(latest.time) : '';

  return (
    <Tooltip title={tooltipText} arrow>
      <Box sx={{ height: '100%' }}>
        <LabelPanel title={label} sx={{ height: '100%' }}>
          {/* Latest reading, and when it was taken. On a past date that is
              the last reading of that day, so the time is not decoration —
              without it the number reads as "now". */}
          <FactHeadline
            name=""
            value={currentValue == null ? '—' : currentValue}
            unit={currentValue != null ? unit : undefined}
          />
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
            {currentValue == null ? 'No readings for this day' : `Latest reading, ${asOf}`}
          </Typography>

          {/* Target indicator */}
          {target && (
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {`Aim for ${target}`}
            </Typography>
          )}

          {/* Sparkline */}
          <Box sx={{ mt: 1 }}>
            <SparklineChart data={data} color={color} height={50} />
          </Box>
        </LabelPanel>
      </Box>
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
        <Typography variant="body2" color="text.secondary">No readings for this day</Typography>
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
          format: '%-I:%M %p',
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
        areaOpacity={0.1}
        useMesh
        enableSlices="x"
        sliceTooltip={({ slice }) => (
          <Box sx={{
            backgroundColor: theme.palette.background.paper,
            border: `2px solid ${theme.palette.text.primary}`,
            px: 1.5,
            py: 1,
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatClockTime(slice.points[0].data.x, { withDate: true })}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
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
  // The latest reading of each series, or null. These defaulted to 0, which
  // put "0 bpm" on screen for any day the watch recorded nothing.
  const latestOf = (series) => (series.length > 0 ? series[series.length - 1].value : null);
  const currentHR = latestOf(data.heartRate);
  const currentStress = latestOf(data.stress);
  const currentBattery = latestOf(data.bodyBattery);

  const blue = theme.palette.primary.main;

  return (
    <Box>
      {/* Summary Cards: three label panels; one across from md up */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 1.75, md: 2.25 }, mb: 2.25 }}>
        <MetricCardWithChart
          label="Heart rate"
          currentValue={currentHR}
          unit="bpm"
          data={data.heartRate}
          color={blue}
          tooltipText="Heart rate from your Garmin device — the latest reading for the day shown"
        />
        <MetricCardWithChart
          label="Stress"
          currentValue={currentStress}
          unit="/100"
          data={data.stress}
          color={blue}
          target="under 40"
          tooltipText="Garmin’s stress score from heart-rate variability (HRV), 0–100. Lower is calmer."
        />
        <MetricCardWithChart
          label="Body Battery"
          currentValue={currentBattery}
          unit="/100"
          data={data.bodyBattery}
          color={blue}
          tooltipText="Garmin’s 0–100 energy estimate: it charges while you rest and drains with activity and stress."
        />
      </Box>

      {/* Detailed Charts */}
      {viewMode === 'detailed' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 1.75, md: 2.25 } }}>
          <LabelPanel title="Heart rate through the day" sx={{ gridColumn: { md: '1 / -1' } }}>
            <DetailedChart
              data={data.heartRate}
              label="Heart rate"
              color={blue}
              yAxisLabel="bpm"
              height={250}
            />
          </LabelPanel>
          <LabelPanel title="Stress through the day">
            <DetailedChart
              data={data.stress}
              label="Stress"
              color={blue}
              yAxisLabel=""
              height={200}
            />
          </LabelPanel>
          <LabelPanel title="Body Battery">
            <DetailedChart
              data={data.bodyBattery}
              label="Energy"
              color={blue}
              yAxisLabel=""
              height={200}
            />
          </LabelPanel>
        </Box>
      )}

      {/* Toggle View Button: a text link in blue, not a filled chip */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Button
          variant="text"
          onClick={() => setViewMode(viewMode === 'summary' ? 'detailed' : 'summary')}
          sx={{ fontWeight: 700, minHeight: 44 }}
        >
          {viewMode === 'summary' ? 'Show the charts' : 'Hide the charts'}
        </Button>
      </Box>
    </Box>
  );
}
