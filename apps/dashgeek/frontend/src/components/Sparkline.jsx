import React from 'react';
import { useTheme } from '@mui/material/styles';

/**
 * Sparkline — 48×16 SVG trend primitive.
 *
 * Stroke-only (no fill). Normalized to fit the bounding box.
 * Accessible via role="img" + aria-label.
 *
 * Used in LedgerCard headers and any widget that wants an inline
 * trend glyph. WeightWidget.jsx has a fuller 14-day chart; this
 * primitive is the lean header-badge version.
 */
export default function Sparkline({
  values = [],
  color,
  width = 48,
  height = 16,
  label = '7-day trend',
}) {
  const theme = useTheme();
  const strokeColor = color ?? theme.palette.text.disabled;

  // Need at least 2 points to draw a line
  if (!values || values.length < 2) {
    if (values?.length === 1) {
      // Single value — render a centered dot
      const cx = width / 2;
      const cy = height / 2;
      return (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <circle cx={cx} cy={cy} r={1.5} fill={strokeColor} />
        </svg>
      );
    }
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Padding within the SVG so strokes aren't clipped at edges
  const padX = 1;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * innerW;
    // If range is zero (flat line), place at vertical center
    const y =
      range === 0
        ? padY + innerH / 2
        : padY + innerH - ((v - min) / range) * innerH;
    return [x, y];
  });

  const pathD = pts
    .map((p, i) => (i === 0 ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}` : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`))
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
