import React, { useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { utcDateString } from '@geeksuite/utils';
import { readableOn } from '@geeksuite/ui';
import { Surface, SectionLabel, DisplayHeading, buildChartTheme } from '../primitives';
import { buildWeightTrend, splitAtGaps } from './weightTrend.js';
import ChartTooltip from './chartTooltip.jsx';
import { massDomain, tooltipDay, useTooltipGuard } from './chartTips.js';

const MARGIN = { top: 12, right: 16, bottom: 40, left: 40 };

// Series ids double as legend labels and tooltip names.
export const SERIES = Object.freeze({
  trend: '7-day average',
  readings: 'Readings',
  goal: 'Goal',
  projection: 'Projection',
});

const WeightTimeline = ({ weightLogs = [], goal = null, unit = 'lbs' }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const muted = theme.palette.text.secondary;
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);

  // §0: the line is a 7-day trailing mean; raw readings are faint dots; the
  // projection exists only on ≥ 14 days of logs and follows the smoothed
  // trend. All of it is computed in weightTrend.js, which is tested alone.
  const model = useMemo(() => buildWeightTrend(weightLogs, { goal }), [weightLogs, goal]);

  const projectionColor = model.projection
    ? (model.projection.onTrack ? theme.palette.success.main : theme.palette.warning.main)
    : null;

  const chartData = useMemo(() => {
    const lines = [];
    if (model.goalLine) lines.push({ id: SERIES.goal, color: muted, data: model.goalLine });
    if (model.readings.length) {
      lines.push({ id: SERIES.readings, color: alpha(primary, 0.45), data: model.readings });
      lines.push({ id: SERIES.trend, color: primary, data: model.trend });
    }
    if (model.projection) {
      lines.push({ id: SERIES.projection, color: projectionColor, data: model.projection.points });
    }
    return lines;
  }, [model, muted, primary, projectionColor]);

  // At least 10 lb tall (review D-4), so scale noise isn't drawn as a cliff.
  const yAxisDomain = useMemo(
    () => massDomain(chartData.flatMap((line) => line.data.map((point) => point.y)), 10),
    [chartData],
  );
  const chartRef = useRef(null);
  const guard = useTooltipGuard();
  const u = unit === 'lbs' ? 'lb' : unit;

  if (!model.readings.length) {
    return (
      <Surface sx={{ textAlign: 'center', py: 5 }}>
        <SectionLabel sx={{ justifyContent: 'center', mb: 1.5 }}>Weight trend</SectionLabel>
        <Typography sx={{ color: muted, fontSize: '0.875rem' }}>
          No weight data to display yet.
        </Typography>
        <Typography sx={{ color: muted, fontSize: '0.75rem', mt: 0.5 }}>
          Log your first weight entry to see your trend.
        </Typography>
      </Surface>
    );
  }

  const paper = theme.palette.background.paper;
  // The status word is 12px text in a domain colour, so it is measured
  // against the paper it sits on (GEEK_SUITE_DESIGN_LANGUAGE, "Colour on a
  // surface") — success.main alone is a graphic colour, not an ink.
  const statusInk = projectionColor ? readableOn(projectionColor, paper, { under: paper }) : null;

  const legend = [
    { key: 'trend', label: SERIES.trend, color: primary, kind: 'line' },
    { key: 'readings', label: SERIES.readings, color: alpha(primary, 0.45), kind: 'dot' },
    model.goalLine && { key: 'goal', label: SERIES.goal, color: muted, kind: 'dash' },
    model.projection && {
      key: 'projection',
      label: SERIES.projection,
      color: projectionColor,
      kind: 'dash',
      suffix: { label: model.projection.onTrack ? 'On track' : 'Off track', color: statusInk },
    },
  ].filter(Boolean);

  return (
    <Surface>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 2,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <SectionLabel sx={{ mb: 0.75 }}>Weight trend</SectionLabel>
          <DisplayHeading size="card">Your curve</DisplayHeading>
        </Box>
        <Box sx={{ display: 'flex', columnGap: 2, rowGap: 1, flexWrap: 'wrap' }}>
          {legend.map(({ key, ...item }) => (
            <LegendItem key={key} {...item} muted={muted} />
          ))}
        </Box>
      </Box>
      {!model.projection && model.goalLine && paceHint(model.pace) && (
        <Typography sx={{ color: muted, fontSize: '0.8125rem', mb: 1 }}>
          {paceHint(model.pace)}
        </Typography>
      )}

      {/* The y-axis unit, said once (review D-4). */}
      <Typography data-testid="weight-y-unit" aria-hidden sx={{ color: muted, fontSize: '0.8125rem', fontWeight: 600, mb: 0.25 }}>
        {u}
      </Typography>
      <Box ref={chartRef} {...guard.handlers} sx={{ height: { xs: 280, sm: 340 } }}>
        <ResponsiveLine
          data={chartData}
          theme={chartTheme}
          role="img"
          ariaLabel={`Weight over time, in ${unit}: a 7-day average line over each reading${model.goalLine ? ', against the goal line' : ''}`}
          margin={MARGIN}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
          xFormat="time:%Y-%m-%d"
          yScale={{ type: 'linear', min: yAxisDomain[0], max: yAxisDomain[1] }}
          axisBottom={{
            format: '%b %d',
            tickRotation: 0,
            tickSize: 0,
            tickPadding: 12,
            tickValues: 4,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            tickValues: 5,
            format: (v) => `${Math.round(v)}`,
          }}
          colors={(line) => line.color}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          // @nivo/line 0.99 types pointBorderColor as an InheritedColorConfig:
          // a custom function is called with the POINT datum, not the series,
          // so `{ from: 'seriesColor' }` is the per-series form.
          pointBorderColor={{ from: 'seriesColor' }}
          enablePointLabel={false}
          useMesh
          curve="monotoneX"
          // A plain number in this version (a function rendered as a literal
          // string in `strokeWidth`). The lines themselves are drawn by the
          // custom layer below, which sets each series' own width.
          lineWidth={2.5}
          enableArea={false}
          enableSlices="x"
          enableGridX={false}
          sliceTooltip={({ slice }) => (guard.armed() ? (
            <ChartTooltip
              chartRef={chartRef}
              marginLeft={MARGIN.left}
              x={slice.x}
              title={tooltipDay(slice.points[0]?.data?.xFormatted)}
              rows={slice.points.map((point) => ({
                key: point.id,
                label: point.seriesId === SERIES.readings ? 'Weigh-in' : point.seriesId,
                value: `${Number(point.data.yFormatted).toFixed(1)} ${u}`,
                color: point.seriesColor,
              }))}
            />
          ) : null)}
          layers={[
            'grid',
            'markers',
            'axes',
            'areas',
            // Lines, drawn by hand so each series gets its own treatment: the
            // 7-day average is the one solid line; the goal and projection are
            // dashed guides; the readings are NOT joined at all — connecting
            // raw weigh-ins is exactly the day-over-day story §0 forbids.
            ({ lineGenerator, series }) =>
              series.map(({ id, data, color }) => {
                if (id === SERIES.readings) return null;
                const d = lineGenerator(data.map((p) => p.position));
                if (id === SERIES.trend) {
                  // One path per unbroken stretch: months without weigh-ins
                  // are a gap in the line, not a smooth invented history.
                  return (
                    <g key={id} data-testid="weight-trend-line">
                      {splitAtGaps(data, (p) => (p?.data?.x != null ? utcDateString(p.data.x) : null)).map((stretch, i) => (
                        <path
                          key={`${id}-${i}`}
                          d={lineGenerator(stretch.map((p) => p.position))}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.5}
                        />
                      ))}
                    </g>
                  );
                }
                return (
                  <path
                    key={id}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    style={{ opacity: id === SERIES.goal ? 0.55 : 0.9 }}
                  />
                );
              }),
            // Points, drawn by hand: pointSize can't vary per series in this
            // @nivo/line version. Only the raw readings get a dot — small,
            // faint, no ring — so the eye follows the average, not the noise.
            ({ points }) =>
              points
                .filter(({ seriesId }) => seriesId === SERIES.readings)
                .map((point) => (
                  <circle
                    key={point.id}
                    cx={point.x}
                    cy={point.y}
                    r={2.5}
                    fill={point.seriesColor ?? point.borderColor}
                    stroke="none"
                  />
                )),
            'slices',
            'mesh',
          ]}
        />
      </Box>
    </Surface>
  );
};

// Legend item — matches the SectionLabel tick aesthetic. Defined outside the
// component so React does not remount it on every render.
const LegendItem = ({ color, label, kind, suffix, muted }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
    {kind === 'dot' ? (
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, mx: '4px', flexShrink: 0 }} />
    ) : (
      <Box
        sx={{
          width: 14,
          height: kind === 'dash' ? 0 : 2,
          borderTop: kind === 'dash' ? `2px dashed ${color}` : 'none',
          backgroundColor: kind === 'dash' ? 'transparent' : color,
          flexShrink: 0,
        }}
      />
    )}
    <Typography
      sx={{
        fontSize: '0.75rem',
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
          fontSize: '0.75rem',
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

/**
 * Why there is no projection line yet, in words — measured from the program's
 * start (weightTrend.js `programPace`), never from older weigh-ins.
 */
function paceHint(pace) {
  if (!pace) return null;
  if (pace.phase === 'not-started') return 'Your program hasn’t started yet — the line follows your plan until it does.';
  if (pace.phase === 'too-early') {
    const left = Math.max(1, 14 - pace.programDays);
    return `A projection from your own pace appears after two weeks of weigh-ins in the program (${left} more day${left === 1 ? '' : 's'}).`;
  }
  return null;
}

export default WeightTimeline;
