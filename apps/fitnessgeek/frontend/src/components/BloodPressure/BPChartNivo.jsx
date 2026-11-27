import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { ResponsiveLine } from '@nivo/line';
import { displayCalendarDate } from '@geeksuite/utils';
import { LabelPanel, buildChartTheme } from '../primitives';

const MARGIN = { top: 12, right: 28, bottom: 40, left: 36 };
/** Room one date label needs ("Nov 25" at 11px, and air beside it). */
export const TICK_MIN_GAP = 56;
/** The plot width assumed until the chart has been measured: a phone's. */
const UNMEASURED_WIDTH = 240;

/**
 * Which dates get a label, so two labels never touch at any width.
 *
 * The x scale is a POINT scale: the dates sit evenly across the plot, one per
 * day that has a reading. The old picker chose a count from the span of days
 * alone, never the width, and then always appended the last date, which is
 * how "Nov 25" and "Nov 27" came to be printed on top of each other on a
 * desktop (review, round three). This one works from the width: a fixed step,
 * big enough that neighbours are at least `minGap` apart, counted back from
 * the newest date, so the newest is always labelled and nothing is appended.
 *
 * @param {string[]} dates the x values in order (repeats allowed)
 * @param {number} plotWidth the plot's inner width in px
 * @param {number} [minGap]
 * @returns {string[]}
 */
export function thinTicks(dates, plotWidth, minGap = TICK_MIN_GAP) {
  const unique = [...new Set(Array.isArray(dates) ? dates : [])];
  if (unique.length <= 1) return unique;
  const between = (plotWidth > 0 ? plotWidth : UNMEASURED_WIDTH) / (unique.length - 1);
  const step = Math.max(1, Math.ceil(minGap / between));
  const out = [];
  for (let i = unique.length - 1; i >= 0; i -= step) out.unshift(unique[i]);
  return out;
}

/**
 * BPChartNivo — systolic + diastolic line chart with reference lines.
 *
 * A card; systolic in ink and diastolic in the blue (both
 * 3px, so neither borrows a status colour), the reference lines in the one
 * small status set (normal = success, a little high = warning, high = error;
 * dashed, with the word in the legend), a hairline grid, and a rounded tooltip
 * with a hairline edge.
 */
const BPChartNivo = ({ data }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const muted = theme.palette.text.secondary;
  const ink = theme.palette.text.primary;
  const systolicColor = theme.palette.text.primary;
  const diastolicColor = theme.palette.primary.main;
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);

  // The chart's own width, for the date labels (`thinTicks`).
  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return undefined;
    const measure = () => setChartWidth(el.getBoundingClientRect?.().width || 0);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The box only exists once there is data to draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data && data.length)]);

  const { chartData, dates } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], dates: [] };

    const sortedData = [...data]
      .filter((item) => {
        const s = parseFloat(item.systolic);
        const d = parseFloat(item.diastolic);
        const date = new Date(item.log_date);
        return !isNaN(s) && !isNaN(d) && !isNaN(date.getTime());
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
      .map((item) => ({
        // `log_date` is a CALENDAR date stored at UTC midnight, not an
        // instant — plain `toLocaleDateString()` reads that UTC midnight in
        // the browser's own zone, which is the previous day for anyone west
        // of UTC. `displayCalendarDate` forces `timeZone: 'UTC'` so the x-axis
        // label and tooltip (which reuses this `date` field via `point.data.x`)
        // show the day the reading was actually logged.
        date: displayCalendarDate(item.log_date, 'en-US', {
          month: 'short',
          day: 'numeric',
        }),
        systolic: parseFloat(item.systolic),
        diastolic: parseFloat(item.diastolic),
        fullDate: item.log_date,
      }));

    const lines = [
      // Reference bands first so they sit under the data lines
      {
        id: 'Stage 1 (140)',
        color: theme.palette.error.main,
        data: sortedData.map((item) => ({ x: item.date, y: 140 })),
      },
      {
        id: 'Elevated (130)',
        color: theme.palette.warning.main,
        data: sortedData.map((item) => ({ x: item.date, y: 130 })),
      },
      {
        id: 'Normal (120)',
        color: theme.palette.success.main,
        data: sortedData.map((item) => ({ x: item.date, y: 120 })),
      },
      // Data lines on top
      {
        id: 'Systolic',
        color: systolicColor,
        data: sortedData.map((item) => ({ x: item.date, y: item.systolic })),
      },
      {
        id: 'Diastolic',
        color: diastolicColor,
        data: sortedData.map((item) => ({ x: item.date, y: item.diastolic })),
      },
    ];

    return {
      chartData: lines,
      dates: sortedData.map((item) => item.date),
    };
  }, [data, systolicColor, diastolicColor, theme]);

  const tickValues = useMemo(
    () => thinTicks(dates, chartWidth ? chartWidth - MARGIN.left - MARGIN.right : 0),
    [dates, chartWidth],
  );

  if (chartData.length === 0) {
    return (
      <LabelPanel title="Your blood pressure over time" titleComponent="h3">
        <Typography sx={{ color: muted, fontSize: '0.875rem', pt: 1.5 }}>
          No readings yet in this range.
        </Typography>
      </LabelPanel>
    );
  }

  const isReferenceLine = (id) =>
    id.includes('Normal') || id.includes('Elevated') || id.includes('Stage');

  // Small legend chip
  const LegendItem = ({ color, label, isDashed }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 14,
          height: isDashed ? 0 : 3,
          borderTop: isDashed ? `2px dashed ${color}` : 'none',
          backgroundColor: isDashed ? 'transparent' : color,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: muted,
        }}
      >
        {label}
      </Typography>
    </Box>
  );

  return (
    <LabelPanel title="Your blood pressure over time" titleComponent="h3">
      <Box sx={{ display: 'flex', columnGap: { xs: 1.5, sm: 2 }, rowGap: 0.5, flexWrap: 'wrap', py: 1 }}>
        <LegendItem color={systolicColor} label="Top number (systolic)" />
        <LegendItem color={diastolicColor} label="Bottom number (diastolic)" />
        <LegendItem color={theme.palette.success.main} label="Normal · 120" isDashed />
        <LegendItem color={theme.palette.warning.main} label="A little high · 130" isDashed />
        <LegendItem color={theme.palette.error.main} label="High (stage 1) · 140" isDashed />
      </Box>

      <Box ref={chartRef} sx={{ height: isMobile ? 240 : 300 }}>
        <ResponsiveLine
          data={chartData}
          theme={chartTheme}
          role="img"
          ariaLabel="Systolic and diastolic blood pressure over time"
          margin={MARGIN}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 60, max: 180, stacked: false }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 10,
            // Level at every width: thinned labels have room, and slanted
            // ones were harder to read.
            tickRotation: 0,
            tickValues,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            tickValues: [80, 100, 120, 140, 160],
          }}
          enableGridX={false}
          enableGridY
          gridYValues={[80, 100, 120, 140, 160]}
          pointColor={{ theme: 'background' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'seriesColor' }}
          enableArea={false}
          useMesh
          enableSlices={false}
          colors={(serie) => serie.color}
          // @nivo/line 0.99 types lineWidth/pointSize as a plain number (handed
          // straight to `strokeWidth`/`r = size / 2`), not a per-series function —
          // a function here rendered `<circle r="NaN">` and never drew a point.
          // lineWidth is otherwise inert: the 'lines' layer isn't in the `layers`
          // list below, the two custom path layers draw the real strokes. Point
          // size/visibility now comes from the custom points layer below, which
          // can vary by series the way the old function tried to.
          lineWidth={3}
          enablePointLabel={false}
          curve="monotoneX"
          crosshairType="cross"
          tooltip={({ point }) => {
            // Find systolic & diastolic for this x
            const systolic = chartData
              .find((s) => s.id === 'Systolic')
              ?.data.find((d) => d.x === point.data.x)?.y;
            const diastolic = chartData
              .find((s) => s.id === 'Diastolic')
              ?.data.find((d) => d.x === point.data.x)?.y;

            return (
              <Box
                sx={{
                  background: theme.palette.background.paper,
                  px: 1.75,
                  py: 1.25,
                  borderRadius: '10px',
                  border: `1px solid ${theme.palette.divider}`,
                  boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
                  minWidth: 150,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "inherit",
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: muted,
                    mb: 0.75,
                    display: 'block',
                  }}
                >
                  {point?.data?.x || '—'}
                </Typography>
                {systolic != null && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
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
                          backgroundColor: systolicColor,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.75rem', color: muted, fontWeight: 600 }}>
                        Top
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: "inherit",
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: ink,
                      }}
                    >
                      {systolic}
                    </Typography>
                  </Box>
                )}
                {diastolic != null && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          backgroundColor: diastolicColor,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.75rem', color: muted, fontWeight: 600 }}>
                        Bottom
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: "inherit",
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: ink,
                      }}
                    >
                      {diastolic}
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          }}
          layers={[
            'grid',
            'axes',
            'areas',
            // Custom dashed reference lines
            ({ lineGenerator, series }) =>
              series
                .filter(({ id }) => isReferenceLine(id))
                .map(({ id, data, color }) => {
                  const d = lineGenerator(data.map((pt) => pt.position));
                  return (
                    <path
                      key={id}
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      style={{ opacity: 0.9 }}
                    />
                  );
                }),
            // Data lines layer (non-reference)
            ({ lineGenerator, series }) =>
              series
                .filter(({ id }) => !isReferenceLine(id))
                .map(({ id, data, color }) => {
                  const d = lineGenerator(data.map((pt) => pt.position));
                  return (
                    <path
                      key={id}
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                    />
                  );
                }),
            // Points layer, drawn by hand: pointSize can't vary per series in
            // this @nivo/line version (it's one number for the whole chart),
            // so reference-band points are simply never drawn and Systolic/
            // Diastolic points use the old mobile-aware radius directly.
            // point.color / point.borderColor are still computed correctly by
            // the pointColor/pointBorderColor props above regardless of
            // whether 'points' is in this layers list.
            ({ points }) =>
              points
                .filter(({ seriesId }) => !isReferenceLine(seriesId))
                .map((point) => (
                  <circle
                    key={point.id}
                    cx={point.x}
                    cy={point.y}
                    r={(isMobile ? 5 : 7) / 2}
                    fill={point.color}
                    stroke={point.borderColor}
                    strokeWidth={2}
                  />
                )),
            'mesh',
          ]}
        />
      </Box>
    </LabelPanel>
  );
};

export default BPChartNivo;
