import React from 'react';
import { Box, Typography } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';
import { readableOn } from '@geeksuite/ui';
import { Surface, StatNumber, SectionLabel } from '../primitives';

const statEnter = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/**
 * StatCard — a compact metric surface used by the dashboard and Activity.
 *
 * Now built on top of the primitives: Surface, StatNumber, SectionLabel.
 * The numeric value uses JetBrains Mono + tabular-nums automatically.
 *
 * Props:
 *   icon        : MUI icon component
 *   label       : SectionLabel text (rendered uppercase)
 *   value       : number or string (string passes through for things like "180/80")
 *   unit        : small unit suffix (kcal, bpm, %, etc.)
 *   trend       : 'up' | 'down' | null
 *   trendValue  : string shown next to the trend arrow
 *   color       : accent color for the icon + hover border. Prefer a
 *                 theme.palette colour; the icon is measured against its own
 *                 tint (readableOn, 3:1) so any hue stays visible in both modes.
 *   caption     : a short neutral line under the value (e.g. what a change
 *                 is measured against, or why there is no number yet)
 *   plainValue  : render `value` verbatim instead of animating it as a number
 *                 — for signed values like "+1.2", which StatNumber would
 *                 print without the sign
 */
export default function StatCard({
  icon: IconComponent,
  label,
  value,
  unit = '',
  trend = null,
  trendValue = null,
  color,
  showLabel = true,
  delay = 0,
  caption = null,
  plainValue = false,
}) {
  const theme = useTheme();

  // Resolve accent color — tolerate hex, rgb, or "theme.palette.x.y" string
  const resolveColor = (c) => {
    if (!c) return theme.palette.primary.main;
    if (typeof c !== 'string') return theme.palette.primary.main;
    if (c.startsWith('#') || c.startsWith('rgb')) return c;
    const parts = c.replace('theme.palette.', '').split('.');
    let resolved = theme.palette;
    for (const p of parts) {
      resolved = resolved?.[p];
    }
    return typeof resolved === 'string' ? resolved : theme.palette.primary.main;
  };

  const baseColor = resolveColor(color);
  const paper = theme.palette.background.paper;
  const iconBg = alpha(baseColor, theme.palette.mode === 'dark' ? 0.2 : 0.1);
  const iconInk = readableOn(baseColor, iconBg, { min: 3, under: paper });
  const showTrend = trend !== null && trendValue !== null && trendValue !== '';
  const isPositive = trend === 'up';

  // Determine if value is a plain number that should animate via StatNumber
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/,/g, ''));
  const isNumeric = !plainValue && Number.isFinite(numericValue) && String(value).trim() !== '' && !String(value).includes('/');
  // 12px trend text on paper: measured to 4.5:1 rather than trusted.
  const trendInk = readableOn(isPositive ? theme.palette.success.main : theme.palette.error.main, paper);

  return (
    <Surface
      padded={false}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        px: 1.5,
        py: 1.25,
        animation: `${statEnter} 460ms cubic-bezier(0.22, 1, 0.36, 1) both`,
        animationDelay: `${delay}ms`,
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
        },
        transition: 'border-color 180ms ease, transform 180ms ease',
        '&:hover': {
          borderColor: alpha(baseColor, 0.4),
          transform: 'translateY(-1px)',
        },
      }}
    >
      {/* Icon + label row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            backgroundColor: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {IconComponent && <IconComponent sx={{ fontSize: 14, color: iconInk }} />}
        </Box>
        {showLabel && <SectionLabel>{label}</SectionLabel>}
      </Box>

      {/* Value — uses StatNumber for numbers, falls back to plain Typography for strings like "180/80" */}
      {isNumeric ? (
        <StatNumber value={numericValue} unit={unit} size="display" />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: { xs: '1.75rem', sm: '2rem' },
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: 'text.primary',
            }}
          >
            {value || '--'}
          </Typography>
          {unit && (
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
              }}
            >
              {unit}
            </Typography>
          )}
        </Box>
      )}

      {/* Trend indicator */}
      {showTrend && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5 }}>
          {isPositive ? (
            <TrendingUp sx={{ fontSize: 12, color: trendInk }} />
          ) : (
            <TrendingDown sx={{ fontSize: 12, color: trendInk }} />
          )}
          <Typography
            sx={{
              color: trendInk,
              fontWeight: 600,
              fontSize: '0.75rem',
              letterSpacing: '0.02em',
            }}
          >
            {trendValue}
          </Typography>
        </Box>
      )}

      {caption && (
        <Typography
          data-testid="stat-caption"
          sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.5, lineHeight: 1.3 }}
        >
          {caption}
        </Typography>
      )}
    </Surface>
  );
}
