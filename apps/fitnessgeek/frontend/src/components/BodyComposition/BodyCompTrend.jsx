import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { Surface, SectionLabel, buildChartTheme } from '../primitives';
import { bodyCompTrendSeries, formatDay } from './bodyCompFormat.js';

/**
 * Fat and lean mass over time — two small charts, stacked, sharing one time
 * axis. Lazily loaded (the page's only other Nivo island is WeightTimeline).
 *
 * Why two charts and not one: fat (~140 lb) and lean (~177 lb) sit ~40 lb
 * apart, and what matters is a change of a pound or two in either. On one
 * shared axis both lines are flat; on twin axes the crossing point is an
 * artefact of two arbitrary scales and reads as meaning something. Two
 * panels, each scaled to its own values, show both trends at a legible size
 * and never invite comparing heights that are not comparable.
 *
 * Each panel's y-range is at least `MIN_SPAN_LB` tall, so a week of ±0.3 lb
 * wobble does not fill the panel and look like a cliff — scaling to the noise
 * would undo the smoothing.
 *
 * The line is a 7-day trailing mean (`rollingMean`); raw scans are faint dots
 * and are never joined (FITNESSGEEK_BODY_DATA_PLAN §0).
 */
export const MIN_SPAN_LB = 6;

export function yRange(points) {
  const ys = points.map((p) => p.y).filter((y) => Number.isFinite(y));
  if (!ys.length) return ['auto', 'auto'];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = Math.max(hi - lo, MIN_SPAN_LB);
  const mid = (lo + hi) / 2;
  return [Math.floor(mid - span / 2 - 0.5), Math.ceil(mid + span / 2 + 0.5)];
}

const Panel = ({ label, series, color, xMin, xMax, chartTheme, theme, showAxis }) => {
  const data = [
    { id: `${label} readings`, color: alpha(color, 0.4), data: series.readings },
    { id: `${label} 7-day average`, color, data: series.trend },
  ];
  const [yMin, yMax] = yRange([...series.readings, ...series.trend]);
  const muted = theme.palette.text.secondary;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Box sx={{ width: 14, height: 2, backgroundColor: color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
      </Box>
      <Box sx={{ height: showAxis ? 150 : 124 }}>
        <ResponsiveLine
          data={data}
          theme={chartTheme}
          role="img"
          ariaLabel={`${label} over time, in pounds: a 7-day average line over each scan`}
          margin={{ top: 8, right: 12, bottom: showAxis ? 32 : 8, left: 40 }}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day', min: xMin, max: xMax }}
          xFormat="time:%Y-%m-%d"
          yScale={{ type: 'linear', min: yMin, max: yMax }}
          axisBottom={showAxis ? { format: '%b %d', tickSize: 0, tickPadding: 10, tickValues: 4 } : null}
          axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: 3, format: (v) => `${Math.round(v)}` }}
          colors={(s) => s.color}
          enableGridX={false}
          gridYValues={3}
          useMesh
          enableSlices="x"
          curve="monotoneX"
          lineWidth={2.5}
          sliceTooltip={({ slice }) => (
            <Box
              sx={{
                background: theme.palette.background.paper,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.shadows[4],
              }}
            >
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: muted, mb: 0.5 }}>
                {formatDay(slice.points[0].data.xFormatted)}
              </Typography>
              {slice.points.map((p) => (
                <Typography key={p.id} sx={{ fontSize: '0.8125rem', color: 'text.primary', fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.seriesId.endsWith('readings') ? 'Scan' : '7-day avg'} {Number(p.data.yFormatted).toFixed(1)} lb
                </Typography>
              ))}
            </Box>
          )}
          layers={[
            'grid',
            'axes',
            ({ lineGenerator, series: all }) =>
              all.map(({ id, data: pts, color: c }) =>
                id.endsWith('readings') ? null : (
                  <path key={id} d={lineGenerator(pts.map((p) => p.position))} fill="none" stroke={c} strokeWidth={2.5} />
                )),
            ({ points }) =>
              points
                .filter((p) => p.seriesId.endsWith('readings'))
                .map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={2.5} fill={p.seriesColor} />),
            'slices',
            'mesh',
          ]}
        />
      </Box>
    </Box>
  );
};

const BodyCompTrend = ({ scans = [] }) => {
  const theme = useTheme();
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);
  const model = useMemo(() => bodyCompTrendSeries(scans), [scans]);

  const allX = [...model.fat.trend, ...model.lean.trend].map((p) => p.x).sort();
  const xMin = allX[0];
  const xMax = allX[allX.length - 1];

  return (
    <Surface>
      <SectionLabel sx={{ mb: 0.75 }}>Trend</SectionLabel>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', mb: 2 }}>
        Line: 7-day average · dots: each scan
      </Typography>
      {model.days < 2 ? (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          The trend appears once you have scans on two different days.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Panel
            label="Fat mass"
            series={model.fat}
            color={theme.palette.warning.main}
            xMin={xMin}
            xMax={xMax}
            chartTheme={chartTheme}
            theme={theme}
            showAxis={false}
          />
          <Panel
            label="Lean mass"
            series={model.lean}
            color={theme.palette.primary.main}
            xMin={xMin}
            xMax={xMax}
            chartTheme={chartTheme}
            theme={theme}
            showAxis
          />
        </Box>
      )}
    </Surface>
  );
};

export default BodyCompTrend;
