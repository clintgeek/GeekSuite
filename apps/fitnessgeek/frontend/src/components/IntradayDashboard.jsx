import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { WatchOutlined as WatchIcon } from '@mui/icons-material';
import { GeekErrorState } from '@geeksuite/ui';
import { influxService } from '../services/influxService';
import { ResponsiveLine } from '@nivo/line';
import { LabelPanel, StatNumber, EmptyState } from './primitives';
import { buildChartTheme } from './primitives/chartTheme.js';
import { EXPLAIN, WATCH_DOWN_TEXT, watchOutcome } from './Reports/watchWords.js';
import { errorMessage } from '../utils/errorMessage.js';
import {
  toTimeSeries,
  formatClockTime,
  normalizeIntraday,
  EMPTY_INTRADAY,
} from './intradaySeries.js';

/** "6 AM", "12 PM": short enough that four of them fit a phone-wide card. */
const hourTick = (date) => {
  const h = date.getHours();
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * One measure through the day: a 2px line in the app's blue over a faint
 * fill of the same blue, with a time axis and a value axis a phone can read
 * (12px labels, four or five ticks each way, no rotated legends). Touching
 * the line reads out the time and the value.
 *
 * There used to be two charts per measure: a sparkline with no axes on the
 * card, and this one behind a "Show the charts" button. The sparkline could
 * not be read (no scale, no times), so it was decoration; this is the chart,
 * and it is always on the card.
 */
function DayChart({ data, label, unit, color, range, height = 168 }) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const chartTheme = React.useMemo(() => buildChartTheme(theme), [theme]);
  const series = React.useMemo(() => toTimeSeries(data, label, color), [data, label, color]);

  if (series.length === 0) return null;

  return (
    <Box sx={{ height, mx: -1 }}>
      <ResponsiveLine
        data={series}
        theme={chartTheme}
        role="img"
        ariaLabel={`${label} through the day${unit ? `, in ${unit}` : ''}, ${series[0].data.length} readings`}
        margin={{ top: 8, right: 12, bottom: 28, left: 36 }}
        xScale={{ type: 'time', format: 'native', useUTC: false }}
        yScale={{ type: 'linear', min: range ? range[0] : 'auto', max: range ? range[1] : 'auto' }}
        axisBottom={{
          format: hourTick,
          tickSize: 0,
          tickPadding: 8,
          tickValues: narrow ? 'every 6 hours' : 'every 4 hours',
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: 4 }}
        gridYValues={4}
        enableGridX={false}
        colors={(line) => line.color}
        curve="monotoneX"
        lineWidth={2}
        enablePoints={false}
        enableArea
        areaOpacity={0.1}
        areaBaselineValue={range ? range[0] : undefined}
        useMesh
        enableSlices="x"
        sliceTooltip={({ slice }) => (
          <Box sx={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
            px: 3,
            py: 2,
          }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatClockTime(slice.points[0].data.x)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {slice.points[0].data.y}{unit ? ` ${unit}` : ''}
            </Typography>
          </Box>
        )}
      />
    </Box>
  );
}

/**
 * One measure: its name, one plain sentence saying what it is, the latest
 * reading and when it was taken, and the day's chart.
 */
function MeasureCard({ label, explain, value, unit, data, color, range, aim }) {
  /*
   * A "trend" chip lived here. It compared the last ten data points with the
   * ten before them — on an INTRADAY series, so it measured the last few
   * minutes against the few before, and coloured any rise red (backwards for
   * Body Battery). It is gone rather than fixed: a number with no stated
   * window is worse than none.
   */
  const latest = data && data.length > 0 ? data[data.length - 1] : null;
  const asOf = latest ? formatClockTime(latest.time) : '';

  return (
    <LabelPanel title={label} sx={{ height: '100%', minWidth: 0 }}>
      {explain && (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.45, mt: -1.5, mb: 3 }}>
          {explain}
        </Typography>
      )}
      {/* Latest reading, and when it was taken. On a past date that is the
          last reading of that day, so the time is not decoration — without
          it the number reads as "now". */}
      <StatNumber value={value == null ? '—' : value} unit={value != null ? unit : undefined} size="display" />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1, mb: 2 }}>
        {value == null
          ? 'No readings for this day'
          : `Latest reading, ${asOf}${aim ? ` · aim for ${aim}` : ''}`}
      </Typography>
      <DayChart data={data} label={label} unit={unit} color={color} range={range} />
    </LabelPanel>
  );
}

/**
 * Health › Overview: heart rate, stress and Body Battery through one day.
 */
export default function IntradayDashboard({ date }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(EMPTY_INTRADAY);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!date) return undefined;
    // A slow answer for a day you have already left must not overwrite the
    // day you are looking at.
    let current = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await influxService.getIntraday(date, date);
        if (!current) return;
        const outcome = watchOutcome(response);
        if (outcome === 'down') {
          // The data server is unreachable. That is a failed read, and it is
          // said as one: it used to draw as a day with no readings.
          setData(EMPTY_INTRADAY);
          setError(WATCH_DOWN_TEXT);
        } else if (outcome === 'empty') {
          setData(EMPTY_INTRADAY);
        } else {
          // The measurement-column → `value` rename lives in
          // `intradaySeries.js`, shared with MealImpactVisualization.
          setData(normalizeIntraday(response));
        }
      } catch (err) {
        if (!current) return;
        console.warn('Intraday health data unavailable:', err?.message);
        setData(EMPTY_INTRADAY);
        setError(errorMessage(err, WATCH_DOWN_TEXT));
      } finally {
        if (current) setLoading(false);
      }
    }

    fetchData();
    return () => { current = false; };
  }, [date, attempt]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress aria-label="Loading the day’s readings" />
      </Box>
    );
  }

  if (error) {
    return <GeekErrorState title="Couldn’t load this day" error={error} onRetry={retry} data-testid="intraday-error" />;
  }

  // The latest reading of each series, or null. These defaulted to 0, which
  // put "0 bpm" on screen for any day the watch recorded nothing.
  const latestOf = (series) => (series.length > 0 ? series[series.length - 1].value : null);
  const currentHR = latestOf(data.heartRate);
  const currentStress = latestOf(data.stress);
  const currentBattery = latestOf(data.bodyBattery);

  // Nothing at all for the day: one sentence, not three empty cards.
  if (currentHR == null && currentStress == null && currentBattery == null) {
    return (
      <EmptyState
        icon={WatchIcon}
        title="No readings for this day"
        copy="Heart rate, stress and energy show here after your watch syncs. Try another day, or check back later."
        data-testid="intraday-empty"
      />
    );
  }

  const blue = theme.palette.primary.main;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: { xs: 3, md: 4 } }}>
      <MeasureCard
        label="Heart rate"
        explain="Beats a minute, as your watch read them through the day."
        value={currentHR}
        unit="bpm"
        data={data.heartRate}
        color={blue}
      />
      <MeasureCard
        label="Stress"
        explain={EXPLAIN.stress}
        value={currentStress}
        unit="/ 100"
        data={data.stress}
        color={blue}
        range={[0, 100]}
        aim="under 40"
      />
      <MeasureCard
        label="Body Battery"
        explain={EXPLAIN.bodyBattery}
        value={currentBattery}
        unit="/ 100"
        data={data.bodyBattery}
        color={blue}
        range={[0, 100]}
      />
    </Box>
  );
}
