import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { ResponsiveLine } from '@nivo/line';
import {
  Surface,
  SectionLabel,
  DisplayHeading,
  buildChartTheme,
} from '../primitives';

/**
 * BPChartNivo — systolic + diastolic line chart with reference band markers.
 *
 * Editorial treatment: Surface wrapper, DM Serif Display header, JetBrains Mono
 * axis ticks, restrained palette (systolic red, diastolic teal, reference lines
 * muted and dashed). Custom tooltip uses mono tabular-nums.
 */
const BPChartNivo = ({ data, unit = 'mmHg' }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const muted = theme.palette.text.secondary;
  const ink = theme.palette.text.primary;
  const systolicColor = theme.palette.error.main;
  const diastolicColor = theme.palette.primary.main;
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);

  // Smart tick frequency based on data span
  const getOptimalTickValues = (dataPoints) => {
    if (!dataPoints || dataPoints.length === 0) return [];
    const totalPoints = dataPoints.length;
    const firstDate = new Date(dataPoints[0].fullDate);
    const lastDate = new Date(dataPoints[dataPoints.length - 1].fullDate);
    const daysSpan = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
    let optimalLabels;
    if (daysSpan <= 7) optimalLabels = Math.min(totalPoints, 7);
    else if (daysSpan <= 30) optimalLabels = Math.min(Math.ceil(totalPoints / 3), 8);
    else if (daysSpan <= 90) optimalLabels = Math.min(Math.ceil(totalPoints / 5), 10);
    else if (daysSpan <= 365) optimalLabels = Math.min(Math.ceil(totalPoints / 10), 12);
    else optimalLabels = Math.min(Math.ceil(totalPoints / 20), 15);
    optimalLabels = Math.max(2, Math.min(optimalLabels, totalPoints));
    const step = Math.max(1, Math.floor(totalPoints / optimalLabels));
    const tickValues = [];
    for (let i = 0; i < totalPoints; i += step) tickValues.push(dataPoints[i].date);
    const last = dataPoints[dataPoints.length - 1].date;
    if (tickValues[tickValues.length - 1] !== last) tickValues.push(last);
    return tickValues;
  };

  const { chartData, optimalTickValues } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], optimalTickValues: [] };

    const sortedData = [...data]
      .filter((item) => {
        const s = parseFloat(item.systolic);
        const d = parseFloat(item.diastolic);
        const date = new Date(item.log_date);
        return !isNaN(s) && !isNaN(d) && !isNaN(date.getTime());
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
      .map((item) => ({
        date: new Date(item.log_date).toLocaleDateString('en-US', {
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
        color: theme.palette.error.light,
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
      optimalTickValues: getOptimalTickValues(sortedData),
    };
  }, [data, systolicColor, diastolicColor, theme]);

  if (chartData.length === 0) {
    return (
      <Surface sx={{ textAlign: 'center', py: 5 }}>
        <SectionLabel sx={{ justifyContent: 'center', mb: 1.5 }}>
          Blood Pressure Trend
        </SectionLabel>
        <Typography sx={{ color: muted, fontSize: '0.875rem' }}>
          No readings yet in this range.
        </Typography>
      </Surface>
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
          height: isDashed ? 0 : 2.5,
          borderTop: isDashed ? `2px dashed ${color}` : 'none',
          backgroundColor: isDashed ? 'transparent' : color,
          borderRadius: 1,
          flexShrink: 0,
        }}
      />
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
    </Box>
  );

  return (
    <Surface>
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
          <SectionLabel sx={{ mb: 0.75 }}>Blood Pressure</SectionLabel>
          <DisplayHeading size="card">Systolic / Diastolic</DisplayHeading>
        </Box>
        <Box sx={{ display: 'flex', gap: { xs: 1.25, sm: 2 }, flexWrap: 'wrap' }}>
          <LegendItem color={systolicColor} label="Systolic" />
          <LegendItem color={diastolicColor} label="Diastolic" />
          <LegendItem color={theme.palette.success.main} label="Normal 120" isDashed />
          <LegendItem color={theme.palette.warning.main} label="Elevated 130" isDashed />
          <LegendItem color={theme.palette.error.light} label="Stage 1 · 140" isDashed />
        </Box>
      </Box>

      <Box sx={{ height: isMobile ? 240 : 300 }}>
        <ResponsiveLine
          data={chartData}
          theme={chartTheme}
          role="img"
          ariaLabel="Systolic and diastolic blood pressure over time"
          margin={{ top: 12, right: 16, bottom: 40, left: 36 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 60, max: 180, stacked: false }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 10,
            tickRotation: isMobile ? -30 : 0,
            tickValues: optimalTickValues,
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
          lineWidth={2.5}
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
                  borderRadius: 1.5,
                  border: `1px solid ${theme.palette.divider}`,
                  boxShadow: theme.shadows[4],
                  minWidth: 150,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
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
                          borderRadius: '50%',
                          backgroundColor: systolicColor,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.75rem', color: muted, fontWeight: 600 }}>
                        Systolic
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
                      {systolic} {unit}
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
                          borderRadius: '50%',
                          backgroundColor: diastolicColor,
                        }}
                      />
                      <Typography sx={{ fontSize: '0.75rem', color: muted, fontWeight: 600 }}>
                        Diastolic
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
                      {diastolic} {unit}
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
                      style={{ opacity: 0.55 }}
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
                      strokeWidth={2.5}
                      strokeLinecap="round"
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
    </Surface>
  );
};

export default BPChartNivo;
