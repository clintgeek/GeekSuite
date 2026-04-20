import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import Sparkline from '../Sparkline';
import CountUp from '../CountUp';
import { DASH_WEIGHT_TREND } from '../../graphql/queries';

const DOMAIN = 'fitnessgeek';

export default function WeightWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];

  const { data, loading, error } = useQuery(DASH_WEIGHT_TREND, {
    variables: { days: 14 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Weight" loading />
    );
  }

  const trend = data?.dashWeightTrend;
  const entries = trend?.entries || [];
  const latest = entries[entries.length - 1];

  if (error || !latest) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Weight"
        action={{ label: 'open →', href: 'https://fitnessgeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {error ? "couldn't load" : 'no data yet'}
          {' — '}
          <Box
            component="a"
            href="https://fitnessgeek.clintgeek.com"
            target="_blank"
            rel="noreferrer"
            sx={{
              color: 'text.secondary',
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.75rem',
              textDecoration: 'none',
              '&:hover': { color: 'text.primary' },
            }}
          >
            log weight →
          </Box>
        </Typography>
      </LedgerCard>
    );
  }

  // Direction indicator
  const arrowGlyph =
    trend.direction === 'down' ? '↓' : trend.direction === 'up' ? '↑' : '→';
  const arrowColor =
    trend.direction === 'down'
      ? theme.palette.success.main
      : trend.direction === 'up'
        ? theme.palette.error.main
        : theme.palette.text.disabled;

  const changeSign = trend.changeFromFirst > 0 ? '+' : '';
  const changeAbs = trend.changeFromFirst?.toFixed?.(1) ?? '0.0';

  // Extract numeric weight values for sparkline
  const weightValues = entries.map((e) => e.weight);
  // Pass last 7 entries (or all if fewer) to LedgerCard header trend
  const headerTrend = weightValues.slice(-7);

  // Build the full 14-day sparkline inline (larger than the header badge)
  const min = Math.min(...weightValues);
  const max = Math.max(...weightValues);
  const range = max - min || 1;
  const svgW = 100;
  const svgH = 48;
  const padX = 2;
  const padY = 4;
  const innerW = svgW - padX * 2;
  const innerH = svgH - padY * 2;

  const pts = weightValues.map((w, i) => {
    const x = padX + (i / (weightValues.length - 1 || 1)) * innerW;
    const y = padY + innerH - ((w - min) / range) * innerH;
    return [x, y];
  });
  const pathD = pts
    .map((p, i) => (i === 0 ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}` : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`))
    .join(' ');
  const areaD = `${pathD} L ${(padX + innerW).toFixed(2)} ${(padY + innerH).toFixed(2)} L ${padX.toFixed(2)} ${(padY + innerH).toFixed(2)} Z`;

  return (
    <LedgerCard
      domain={DOMAIN}
      title="Weight"
      trend={headerTrend}
    >
      {/* Latest weight — hero mono */}
      <Box sx={{ mb: '6px' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <Box
            sx={{
              fontFamily: theme.typography.fontFamilyMono,
              fontWeight: 500,
              fontSize: '2.25rem',
              lineHeight: 1,
              letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums',
              color: 'text.primary',
            }}
          >
            <CountUp value={latest.weight} decimals={1} />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            lb
          </Typography>
        </Box>

        {/* Date logged */}
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: '2px' }}>
          recorded {latest.date}
        </Typography>
      </Box>

      {/* Delta from first entry */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '16px' }}>
        <Box
          component="span"
          sx={{
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 500,
            fontSize: '0.875rem',
            color: arrowColor,
          }}
        >
          {arrowGlyph}
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {changeSign}{changeAbs} lb over {entries.length} entries
        </Typography>
      </Box>

      {/* Weight goal bracket (if available from trend data) */}
      {trend.weightGoal && (
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: '12px' }}>
          goal: {trend.weightGoal} lb
        </Typography>
      )}

      {/* 14-day sparkline chart */}
      {weightValues.length >= 2 && (
        <Box sx={{ flex: 1, minHeight: 56, display: 'flex', alignItems: 'flex-end' }}>
          <svg
            width="100%"
            height="56"
            viewBox={`0 0 ${svgW} ${svgH}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="14-day weight trend"
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="wgt-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={domainColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={domainColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#wgt-area-grad)" />
            <path
              d={pathD}
              fill="none"
              stroke={domainColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Highlight latest point */}
            {pts.length > 0 && (
              <circle
                cx={pts[pts.length - 1][0]}
                cy={pts[pts.length - 1][1]}
                r="2"
                fill={domainColor}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </Box>
      )}
    </LedgerCard>
  );
}
