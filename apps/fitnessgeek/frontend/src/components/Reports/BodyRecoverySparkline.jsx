import React from 'react';
import { Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { ResponsiveLine } from '@nivo/line';
import { sparkRange } from './bodyRecoveryModel.js';

/**
 * A 90-day sparkline of a 7-day rolling mean. Lazily loaded — it is the only
 * part of the Body & recovery section that needs Nivo.
 *
 * `segments` are the stretches `splitAtGaps` allows a line to join; each is
 * its own series, so a month without readings is empty space, never a line
 * drawn across it (a null y would not do: Nivo 0.99 plots it at 0). A segment
 * of one point gets a dot, since a line needs two.
 *
 * The x-axis is always the full 90 days (`from`…`to`), with a faint hairline
 * along the bottom marking that frame, so a series that started last week
 * reads as recent, not as three months of data. No axes, no hover: the
 * number beside it is the reading; this is the shape.
 */
const BodyRecoverySparkline = ({ segments = [], from, to, minSpan = 0, label, height = 56 }) => {
  const theme = useTheme();
  const color = theme.palette.primary.main;
  const all = segments.flat();
  const [yMin, yMax] = sparkRange(all, minSpan);
  const data = segments.map((seg, i) => ({ id: `seg-${i}`, data: seg }));

  const frame = ({ xScale, innerHeight }) => (
    <line
      key="frame"
      x1={xScale(new Date(`${from}T00:00:00`))}
      x2={xScale(new Date(`${to}T00:00:00`))}
      y1={innerHeight}
      y2={innerHeight}
      stroke={alpha(theme.palette.text.primary, 0.14)}
      strokeWidth={1}
      strokeDasharray="2 3"
    />
  );

  // Lone points get a small dot; the latest 7-day mean — the number printed
  // beside the chart — gets a larger one, so the eye finds "now".
  const marks = ({ series }) =>
    series.flatMap((s, i) => {
      const pts = s.data.map((d) => d.position);
      const out = [];
      if (pts.length === 1) {
        out.push(<circle key={`${s.id}-only`} cx={pts[0].x} cy={pts[0].y} r={2} fill={color} />);
      }
      if (i === series.length - 1 && pts.length) {
        const p = pts[pts.length - 1];
        out.push(<circle key={`${s.id}-now`} cx={p.x} cy={p.y} r={3} fill={color} />);
      }
      return out;
    });

  return (
    <Box sx={{ height, width: '100%' }}>
      {all.length > 0 && (
        <ResponsiveLine
          data={data}
          role="img"
          ariaLabel={label}
          margin={{ top: 6, right: 6, bottom: 6, left: 4 }}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day', min: from, max: to }}
          yScale={{ type: 'linear', min: yMin, max: yMax }}
          axisBottom={null}
          axisLeft={null}
          enableGridX={false}
          enableGridY={false}
          enablePoints={false}
          isInteractive={false}
          animate={false}
          colors={[color]}
          lineWidth={2}
          curve="monotoneX"
          layers={[frame, 'lines', marks]}
        />
      )}
    </Box>
  );
};

export default BodyRecoverySparkline;
