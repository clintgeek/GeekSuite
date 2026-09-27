/**
 * ChartRecorder — a strip of recorder paper with the pen's trace across it:
 * AI calls per UTC day from the ledger (`aiTraffic.days`). The pen draws the
 * trace in when it arrives; under reduced motion it is simply there.
 *
 * `role="img"` with the whole series in its label, because a line is a
 * picture and the numbers are the content. The day labels and the peak are
 * printed on the paper too.
 */
import { Box, Typography, useTheme } from '@mui/material';
import { keyframes } from '@emotion/react';
import { dayLabel } from './readings';

const draw = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;

const W = 320;
const H = 110;
const PAD = { l: 10, r: 10, t: 18, b: 6 };

export default function ChartRecorder({ days = [] }) {
  const theme = useTheme();
  const { chart } = theme.palette.box;
  const values = days.map((d) => Number(d.calls) || 0);
  const peak = Math.max(1, ...values);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (days.length > 1 ? (i / (days.length - 1)) * innerW : innerW / 2);
  const y = (v) => PAD.t + innerH - (v / peak) * innerH;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const summary = days.length
    ? `AI calls per day, last ${days.length} days: ${days.map((d) => `${dayLabel(d.day)} ${d.calls}`).join(', ')}.`
    : 'AI calls per day: no ledger reading.';

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        role="img"
        aria-label={summary}
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'line.strong',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.25)',
        }}
      >
        <Box sx={{ position: 'relative', bgcolor: chart.paper }}>
          <Box
            component="svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
            sx={{ display: 'block', width: '100%', height: { xs: 120, sm: 150 } }}
          >
            {/* Recorder paper: fine rules every 10%, a heavier one each half. */}
            {Array.from({ length: 11 }, (_, i) => (
              <line key={`h${i}`} x1={0} x2={W} y1={PAD.t + (innerH * i) / 10} y2={PAD.t + (innerH * i) / 10} stroke={chart.grid} strokeWidth={i % 5 === 0 ? 1.4 : 0.7} vectorEffect="non-scaling-stroke" />
            ))}
            {days.map((d, i) => (
              <line key={`v${d.day}`} x1={x(i)} x2={x(i)} y1={PAD.t} y2={PAD.t + innerH} stroke={chart.grid} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
            ))}
            {days.length > 0 && (
              <polyline
                points={points}
                fill="none"
                stroke={chart.pen}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pathLength="1"
                style={{ strokeDasharray: 1, animation: `${draw} 1400ms ease-out both` }}
              />
            )}
          </Box>
          <Box
            aria-hidden="true"
            sx={{ position: 'absolute', top: 4, right: 8, fontFamily: 'fontFamilyMono', fontSize: '0.75rem', fontWeight: 700, color: chart.ink }}
          >
            peak {Math.max(0, ...values)}
          </Box>
          <Box
            aria-hidden="true"
            sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5, pb: 0.5, fontFamily: 'fontFamilyMono', fontSize: '0.75rem', color: chart.ink }}
          >
            {days.map((d) => (
              <Box component="span" key={`t${d.day}`} sx={{ textAlign: 'center', minWidth: 0 }}>
                {dayLabel(d.day)}
                <Box component="span" sx={{ display: 'block', fontWeight: 700 }}>{d.calls}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary' }}>
        Calls per UTC day from the AI ledger — free and paid.
      </Typography>
    </Box>
  );
}
