import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import CountUp from '../CountUp';
import { DASH_WEIGHT_TREND } from '../../graphql/queries';
import { tokens } from '../../theme';

export default function WeightWidget({ delay = 0 }) {
  const { data, loading, error } = useQuery(DASH_WEIGHT_TREND, {
    variables: { days: 14 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="04" dept="Fitness / Ledger" kicker="The scales" delay={delay}>
        <Skeleton variant="rectangular" height={72} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={40} />
      </EditorialCard>
    );
  }

  const trend = data?.dashWeightTrend;
  const entries = trend?.entries || [];
  const latest = entries[entries.length - 1];

  if (error || !latest) {
    return (
      <EditorialCard index="04" dept="Fitness / Ledger" kicker="The scales" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint }}>
          The scale has not been troubled lately.
        </Box>
      </EditorialCard>
    );
  }

  const min = Math.min(...entries.map((x) => x.weight));
  const max = Math.max(...entries.map((x) => x.weight));
  const range = max - min || 1;

  const arrow = trend.direction === 'down' ? '↓' : trend.direction === 'up' ? '↑' : '→';
  const arrowColor =
    trend.direction === 'down'
      ? tokens.patina
      : trend.direction === 'up'
        ? tokens.oxblood
        : tokens.boneDim;

  // Build a smooth SVG line for the trend
  const w = 100;
  const h = 100;
  const pts = entries.map((e, i) => {
    const x = (i / (entries.length - 1 || 1)) * w;
    const y = h - ((e.weight - min) / range) * h;
    return [x, y];
  });
  const pathD = pts
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
  const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

  return (
    <EditorialCard
      index="04"
      dept="Fitness / Ledger"
      kicker="The scales"
      href="https://fitnessgeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>14-day window · {entries.length} entries</span>
          <span style={{ color: arrowColor }}>
            {arrow} {trend.changeFromFirst > 0 ? '+' : ''}
            {trend.changeFromFirst?.toFixed?.(1) ?? 0} lb
          </span>
        </>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
        <Box
          sx={{
            fontFamily: tokens.fontDisplay,
            fontSize: { xs: '3.5rem', md: '4.5rem' },
            lineHeight: 0.9,
            fontWeight: 300,
            color: tokens.bone,
            letterSpacing: '-0.04em',
          }}
        >
          <CountUp value={latest.weight} decimals={1} />
        </Box>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', fontSize: '1.2rem', color: tokens.boneFaint }}>
          lb
        </Box>
      </Box>

      <Box
        sx={{
          fontFamily: tokens.fontDisplay,
          fontStyle: 'italic',
          fontSize: '0.85rem',
          color: tokens.boneDim,
          mb: 2,
        }}
      >
        recorded {latest.date}
      </Box>

      {/* Line chart */}
      <Box sx={{ flex: 1, minHeight: 70, display: 'flex', alignItems: 'end' }}>
        <svg
          width="100%"
          height="70"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="weight-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tokens.brass} stopOpacity="0.35" />
              <stop offset="100%" stopColor={tokens.brass} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#weight-grad)" />
          <path
            d={pathD}
            fill="none"
            stroke={tokens.brass}
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {pts.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={i === pts.length - 1 ? 1.8 : 0.8}
              fill={i === pts.length - 1 ? tokens.bone : tokens.brass}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </Box>
    </EditorialCard>
  );
}
