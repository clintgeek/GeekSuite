import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { influxService } from '../services/influxService';
import {
  Box,
  Typography,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { Restaurant as MealIcon } from '@mui/icons-material';
import { GeekErrorState } from '@geeksuite/ui';
import { ResponsiveLine } from '@nivo/line';
import { buildChartTheme } from './primitives/chartTheme.js';
import { LabelPanel, Tag, EmptyState } from './primitives';
import { EXPLAIN, WATCH_DOWN_TEXT, watchOutcome } from './Reports/watchWords.js';
import { errorMessage } from '../utils/errorMessage.js';
import { clockTime } from '../utils/dates.js';
import { fmt, grams } from '../utils/plainWords.js';
import {
  toTimeSeries,
  toDate,
  formatClockTime,
  normalizeIntraday,
  mealsFromLogs,
} from './intradaySeries.js';

/**
 * Meal markers — the dashed vertical rules that say "you ate here".
 *
 * A marker outside the intraday series' own time range is dropped rather than
 * clamped: nivo would otherwise pin it to the edge of the plot, which reads
 * as "you ate at 00:00" instead of "there is no sensor data around that meal".
 *
 * The markers carry no words. Each used to carry the food's name and
 * calories, set vertically in 10px type on top of the line it was marking:
 * two meals logged minutes apart printed over each other and over the data.
 * The cards under the chart name every meal and its time.
 */
function buildMealMarkers(meals, color, domain) {
  if (!domain) return [];
  return meals
    .map((meal) => ({ ...meal, at: toDate(meal.time) }))
    .filter((meal) => meal.at && meal.at >= domain.min && meal.at <= domain.max)
    .map((meal) => ({
      axis: 'x',
      value: meal.at,
      lineStyle: { stroke: color, strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.7 },
    }));
}

/**
 * Calculate average change after meal
 */
function calculateMealImpact(intradayData, mealTime) {
  const mealDate = new Date(mealTime);
  const preWindow = 30; // 30 min before
  const postWindow = 120; // 2 hours after

  const preMealStart = new Date(mealDate.getTime() - preWindow * 60 * 1000);
  const preMealEnd = mealDate;
  const postMealStart = new Date(mealDate.getTime() + 15 * 60 * 1000); // Skip immediate 15 min
  const postMealEnd = new Date(mealDate.getTime() + postWindow * 60 * 1000);

  const preMealData = intradayData.filter(point => {
    const t = new Date(point.time);
    return t >= preMealStart && t <= preMealEnd;
  });

  const postMealData = intradayData.filter(point => {
    const t = new Date(point.time);
    return t >= postMealStart && t <= postMealEnd;
  });

  if (preMealData.length === 0 || postMealData.length === 0) {
    return null;
  }

  const preAvg = preMealData.reduce((sum, p) => sum + p.value, 0) / preMealData.length;
  const postAvg = postMealData.reduce((sum, p) => sum + p.value, 0) / postMealData.length;
  const change = postAvg - preAvg;
  const percentChange = Math.round((change / preAvg) * 100);

  return {
    preAvg: Math.round(preAvg),
    postAvg: Math.round(postAvg),
    change: Math.round(change),
    percentChange
  };
}


/** Only real readings: a gap in the feed must not turn an average into NaN. */
const readings = (rows) => (Array.isArray(rows) ? rows.filter((p) => p && p.value != null && Number.isFinite(Number(p.value))) : []);

/** "6 AM", "12 PM". */
const hourTick = (date) => {
  const h = date.getHours();
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;

/**
 * What the readings around one meal add up to, in a sentence ('' when the
 * change is in between and there is nothing to add). Null when there were
 * no readings around it: then there is nothing to say, and the
 * card says that. It used to fall through to "this meal barely moved your
 * heart rate, stress or energy", a finding made of no data at all.
 */
function mealVerdict({ hrImpact, stressImpact, batteryImpact }) {
  if (!hrImpact && !stressImpact && !batteryImpact) return null;
  const lines = [
    hrImpact && hrImpact.change > 15 && 'Your heart rate rose a lot after this meal. A carb-heavy meal can do that.',
    stressImpact && stressImpact.change > 15 && 'Your stress went up after eating. Something in it may not agree with you.',
    batteryImpact && batteryImpact.change < -15 && 'Your energy dropped after this meal. It may not have kept you full.',
    (!hrImpact || hrImpact.change < 10) && (!stressImpact || stressImpact.change < 10) && (!batteryImpact || batteryImpact.change > -10)
      && 'This meal barely moved your heart rate, stress or energy.',
  ].filter(Boolean);
  return lines.join(' ');
}

/** One measure in a meal's card: its name, before → after, and the change. */
function Delta({ label, impact, unit, metric }) {
  // For heart rate and stress a rise is the worse direction; for energy a
  // fall is. A change is coloured only when it is clearly one or the other.
  const status = metric === 'battery'
    ? (impact.change < -10 ? 'error' : impact.change > 5 ? 'success' : undefined)
    : (impact.change > 10 ? 'error' : impact.change < -5 ? 'success' : undefined);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', mb: 1 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', mb: 1.5 }}>
        {`${impact.preAvg} → ${impact.postAvg}`}
      </Typography>
      <Tag tone={status}>{`${signed(impact.change)}${unit ? ` ${unit}` : ''}`}</Tag>
    </Box>
  );
}

/**
 * One meal: what it was, when, and what the watch read before and after.
 */
function MealImpactCard({ meal, hrImpact, stressImpact, batteryImpact }) {
  const verdict = mealVerdict({ hrImpact, stressImpact, batteryImpact });
  const protein = grams(meal.protein);
  return (
    <LabelPanel
      title={meal.name}
      titleComponent="h3"
      meta={`${clockTime(meal.time)} · ${fmt(meal.calories)} cal · Protein ${protein}${protein === '—' ? '' : 'g'}`}
      sx={{ minWidth: 0 }}
    >
      {verdict !== null ? (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 3, pt: 1 }}>
            {hrImpact && <Delta label="Heart rate" impact={hrImpact} unit="bpm" metric="hr" />}
            {stressImpact && <Delta label="Stress" impact={stressImpact} metric="stress" />}
            {batteryImpact && <Delta label="Energy" impact={batteryImpact} metric="battery" />}
          </Box>
          {verdict && (
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.45, mt: 3 }}>
              {verdict}
            </Typography>
          )}
        </>
      ) : (
        <Typography data-testid="meal-no-readings" sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.45 }}>
          No watch readings around this meal, so there is nothing to compare.
        </Typography>
      )}
    </LabelPanel>
  );
}

const METRICS = {
  heartRate: { label: 'Heart rate', unit: 'bpm', range: null, explain: null },
  stress: { label: 'Stress', unit: '', range: [0, 100], explain: EXPLAIN.stress },
  bodyBattery: { label: 'Body Battery', unit: '', range: [0, 100], explain: EXPLAIN.bodyBattery },
};

/**
 * Health › Meals: the day's readings with a mark at each meal, and the
 * before-and-after for each meal under it.
 *
 * Two reads, each with its own outcome. The food log failing is the panel
 * failing (it used to draw as "No meals logged for this day"). The watch
 * readings failing or being absent leaves the meals up, with a sentence in
 * the chart's place.
 */
export default function MealImpactVisualization({ date }) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);
  const [selectedMetric, setSelectedMetric] = useState('heartRate');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intradayData, setIntradayData] = useState(null);
  // Why there is no line to draw, when the readings could not be fetched.
  const [readingsProblem, setReadingsProblem] = useState(null);
  const [meals, setMeals] = useState([]);
  // Rows logged on another day: no real time, so not on the chart.
  const [untimedCount, setUntimedCount] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!date) return undefined;
    let current = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const [intradayRes, mealsRes] = await Promise.allSettled([
        influxService.getIntraday(date, date),
        apiService.get(`/logs?date=${date}`),
      ]);
      if (!current) return;

      if (mealsRes.status === 'rejected') {
        console.warn('Meal impact: the food log did not load:', mealsRes.reason?.message);
        setMeals([]);
        setUntimedCount(0);
        setIntradayData(null);
        setError(errorMessage(mealsRes.reason, 'Couldn’t load this day’s meals. Try again.'));
        setLoading(false);
        return;
      }

      // GetFoodLogs rows, timed by when they were written (mealsFromLogs).
      const { meals: timed, untimed } = mealsFromLogs(mealsRes.value?.data || [], date);
      setMeals(timed);
      setUntimedCount(untimed);

      // The readings are always SET, to this day's or to nothing. They were
      // only set when a day had some, so stepping to a day without readings
      // left the previous day's line under this day's meals.
      const outcome = intradayRes.status === 'fulfilled' ? watchOutcome(intradayRes.value) : 'down';
      if (outcome === 'ok') {
        // Normalise the measurement column names to `value` (intradaySeries.js).
        setIntradayData(normalizeIntraday(intradayRes.value));
        setReadingsProblem(null);
      } else {
        setIntradayData(null);
        setReadingsProblem(outcome === 'down' ? WATCH_DOWN_TEXT : null);
      }
      setLoading(false);
    }

    fetchData();
    return () => { current = false; };
  }, [date, attempt]);

  // Derived, not stored: a stored copy kept the last day's cards when the
  // next day had meals but no readings.
  const mealImpacts = useMemo(() => meals.map((meal) => ({
    meal,
    hrImpact: calculateMealImpact(readings(intradayData?.heartRate), meal.time),
    stressImpact: calculateMealImpact(readings(intradayData?.stress), meal.time),
    batteryImpact: calculateMealImpact(readings(intradayData?.bodyBattery), meal.time),
  })), [intradayData, meals]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading the day’s meals" />
      </Box>
    );
  }

  if (error) {
    return <GeekErrorState title="Couldn’t load this day’s meals" error={error} onRetry={retry} data-testid="meal-impact-error" />;
  }

  if (!meals || meals.length === 0) {
    return (
      <EmptyState
        icon={MealIcon}
        data-testid="meal-impact-empty"
        title={untimedCount > 0 ? 'No meal times for this day' : 'No meals logged for this day'}
        copy={untimedCount > 0
          ? 'These meals were added later, so I don’t know when you ate them. Meals you log as you eat show here.'
          : 'Log a meal as you eat it to see how your body answered.'}
      />
    );
  }

  const metric = METRICS[selectedMetric] || METRICS.heartRate;
  const color = theme.palette.primary.main;
  const series = toTimeSeries(intradayData?.[selectedMetric], metric.label, color);
  const domain = series.length
    ? { min: series[0].data[0].x, max: series[0].data[series[0].data.length - 1].x }
    : null;
  const mealMarkers = buildMealMarkers(meals, theme.palette.text.primary, domain);
  const gap = { xs: 3, md: 4 };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap }}>
      <LabelPanel title="How your body answered each meal" level={1}>
        <ToggleButtonGroup
          value={selectedMetric}
          exclusive
          onChange={(e, value) => value && setSelectedMetric(value)}
          size="small"
          aria-label="Which reading to chart"
          sx={{ '& .MuiToggleButtonGroup-grouped': { minHeight: 44, minWidth: 44, px: 4 } }}
        >
          <ToggleButton value="heartRate">Heart rate</ToggleButton>
          <ToggleButton value="stress">Stress</ToggleButton>
          <ToggleButton value="bodyBattery">Energy</ToggleButton>
        </ToggleButtonGroup>
        {metric.explain && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.45, mt: 2 }}>
            {selectedMetric === 'bodyBattery' ? `Energy is Body Battery: ${metric.explain}` : metric.explain}
          </Typography>
        )}

        {series.length === 0 ? (
          <Typography
            data-testid="meal-chart-missing"
            role={readingsProblem ? 'alert' : undefined}
            sx={{ fontSize: '0.9375rem', color: 'text.secondary', py: 6 }}
          >
            {readingsProblem || 'No watch readings for this day, so there is no line to draw. Your meals are listed below.'}
          </Typography>
        ) : (
          <>
            <Box sx={{ height: 240, mt: 3, mx: -1 }}>
              <ResponsiveLine
                key={`meal-chart-${selectedMetric}-${date}`}
                data={series}
                theme={chartTheme}
                role="img"
                ariaLabel={`${metric.label} through the day, with a dashed line at each logged meal`}
                margin={{ top: 8, right: 12, bottom: 28, left: 36 }}
                xScale={{ type: 'time', format: 'native', useUTC: false }}
                yScale={{ type: 'linear', min: metric.range ? metric.range[0] : 'auto', max: metric.range ? metric.range[1] : 'auto' }}
                axisBottom={{
                  format: hourTick,
                  tickSize: 0,
                  tickPadding: 8,
                  tickValues: narrow ? 'every 6 hours' : 'every 3 hours',
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
                markers={mealMarkers}
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
                      {slice.points[0].data.y}{metric.unit ? ` ${metric.unit}` : ''}
                    </Typography>
                  </Box>
                )}
              />
            </Box>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.45, mt: 1 }}>
              Each dashed line is a meal you logged. One day proves little: look for the same pattern over several.
            </Typography>
          </>
        )}
      </LabelPanel>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap, alignItems: 'start' }}>
        {mealImpacts.map((impact, idx) => (
          <MealImpactCard
            key={`${impact.meal.time}-${idx}`}
            meal={impact.meal}
            hrImpact={impact.hrImpact}
            stressImpact={impact.stressImpact}
            batteryImpact={impact.batteryImpact}
          />
        ))}
      </Box>
    </Box>
  );
}
