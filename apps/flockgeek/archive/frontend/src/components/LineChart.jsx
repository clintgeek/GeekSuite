import React from 'react';

export default function LineChart({ data = [], width = 600, height = 200, stroke = '#4A90E2' }) {
  if (!data.length) return null;
  const padding = { left: 40, right: 10, top: 10, bottom: 24 };
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;

  const xs = data.map(d => new Date(d.date).getTime());
  const ys = data.map(d => d.eggs);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = 0; // eggs can't be negative
  const maxY = Math.max(1, Math.max(...ys));

  const xScale = (t) => padding.left + ((t - minX) / (maxX - minX || 1)) * W;
  const yScale = (v) => padding.top + H - ((v - minY) / (maxY - minY || 1)) * H;

  const path = data
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(new Date(d.date).getTime())} ${yScale(d.eggs)}`)
    .join(' ');

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => minY + (i * (maxY - minY)) / ticks);

  return (
    <svg width={width} height={height} role="img" aria-label="Eggs per day">
      <g>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="#eee" />
            <text x={4} y={yScale(v) + 4} fontSize="10" fill="#666">{v.toFixed(1)}</text>
          </g>
        ))}
      </g>
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}
