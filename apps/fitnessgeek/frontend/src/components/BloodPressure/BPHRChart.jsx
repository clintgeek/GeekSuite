import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { buildChartTheme } from '../primitives/chartTheme.js';

// Q52a: ported from Recharts to @nivo/line so this page carries ONE chart
// library instead of two. Same series, same teal stroke, same 250px band,
// same "N bpm — Heart Rate" tooltip.
//
// The x axis is the reading's ORDINAL POSITION, labelled with its formatted
// clock time — not a real time scale. Two reasons: the incoming `time` may be
// a unix timestamp in seconds, in milliseconds, or an ISO string (this
// component is fed by both the Garmin series and hand-rolled arrays), and the
// Recharts version it replaces was a category axis too, so an ordinal keeps
// the visual identical. Keying on the formatted label instead would collapse
// two readings that land in the same minute into one point.
const STROKE = '#0D9488';

const formatClock = (timeValue) => {
  if (typeof timeValue === 'number') {
    // Unix timestamp, seconds or milliseconds
    const timestamp = timeValue > 10000000000 ? timeValue : timeValue * 1000;
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (typeof timeValue === 'string' && timeValue.includes('T')) {
    return new Date(timeValue).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return timeValue;
};

// Up to `count` evenly spaced indices, always including the first and last —
// Recharts' `interval="preserveStartEnd"`.
const spacedIndices = (length, count = 6) => {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
};

const BPHRChart = ({ data = [], title = 'Heart Rate (Today)' }) => {
  const theme = useTheme();
  const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);

  // `labels[i]` is the clock text for point i; the axis and the tooltip both
  // read through it, so the chart never has to re-parse a timestamp.
  const { points, labels } = useMemo(() => {
    if (!data || !Array.isArray(data)) return { points: [], labels: [] };
    // Accept either {time, bpm} or Garmin style arrays; normalize
    const rows = data.filter((p) => p && (p.bpm != null || p.heartRate != null));
    return {
      points: rows.map((p, index) => ({ x: index, y: p.bpm ?? p.heartRate })),
      labels: rows.map((p) => formatClock(p.time || p.timestamp || p.ts || '')),
    };
  }, [data]);

  // Recharts' domain was ["dataMin-5", "dataMax+5"].
  const yDomain = useMemo(() => {
    const values = points.map((p) => Number(p.y)).filter((v) => Number.isFinite(v));
    if (values.length === 0) return { min: 'auto', max: 'auto' };
    return { min: Math.min(...values) - 5, max: Math.max(...values) + 5 };
  }, [points]);

  const series = useMemo(() => [{ id: 'Heart Rate', color: STROKE, data: points }], [points]);
  const tickValues = useMemo(() => spacedIndices(points.length), [points.length]);

  return (
    <Card sx={{
      borderRadius: '20px',
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      border: `1px solid ${theme.palette.divider}`
    }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
        <Box sx={{ height: 250 }}>
          {points.length === 0 ? (
            <Box sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No heart-rate data for this day
              </Typography>
            </Box>
          ) : (
            <ResponsiveLine
              data={series}
              theme={chartTheme}
              role="img"
              ariaLabel={`${points.length} heart-rate readings, in beats per minute`}
              margin={{ top: 10, right: 20, bottom: 60, left: 48 }}
              xScale={{ type: 'linear', min: 0, max: Math.max(points.length - 1, 1) }}
              yScale={{ type: 'linear', min: yDomain.min, max: yDomain.max }}
              axisBottom={{
                tickSize: 0,
                tickPadding: 10,
                tickRotation: -45,
                tickValues,
                format: (v) => labels[v] ?? '',
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
                tickValues: 5,
                legend: 'BPM',
                legendOffset: -40,
                legendPosition: 'middle',
                format: (v) => `${Math.round(v)}`,
              }}
              colors={(line) => line.color}
              curve="monotoneX"
              lineWidth={2}
              enablePoints={false}
              enableGridX={false}
              enableArea={false}
              useMesh
              enableSlices="x"
              sliceTooltip={({ slice }) => (
                <Box sx={{
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)',
                }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {labels[slice.points[0].data.x] ?? ''}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {slice.points[0].data.y} bpm &middot; Heart Rate
                  </Typography>
                </Box>
              )}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPHRChart;
