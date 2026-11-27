import React from 'react';
import { Box, Typography } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { readableOn } from '@geeksuite/ui';

/**
 * StatCard — one number inside a card, as a row: **Weight** ……… 318.2 lb, with a muted caption
 * under it. It used to be a little bordered tile with a tinted icon; inside
 * Home's "Your numbers" panel that was a box inside a box, so it is a row now
 * and the panel draws the border. The name is kept for its call sites.
 *
 * Props:
 *   icon        : accepted for compatibility; not drawn (words carry it)
 *   label       : the row's name, as written
 *   value       : number or string ("180/80" passes through)
 *   unit        : small unit suffix, shown as written (cal, lb, mmHg, %)
 *   trend       : 'up' | 'down' | null
 *   trendValue  : the word or amount beside the trend arrow ("High", "1.2k")
 *   color       : accepted for compatibility; status colour comes from the trend
 *   caption     : a short neutral line under the row (what a change is
 *                 measured against, or why there is no number yet)
 *   plainValue  : accepted for compatibility; values always print as given
 *   first       : no hairline above (the row directly under a rule)
 */
export default function StatCard({
  label,
  value,
  unit = '',
  trend = null,
  trendValue = null,
  showLabel = true,
  caption = null,
  first = false,
}) {
  const theme = useTheme();
  const paper = theme.palette.background.paper;
  const showTrend = trend !== null && trendValue !== null && trendValue !== '';
  const isPositive = trend === 'up';
  // Small trend text on paper: measured to 4.5:1 rather than trusted.
  const trendInk = readableOn(isPositive ? theme.palette.success.main : theme.palette.error.main, paper);
  const shown = typeof value === 'number' ? value.toLocaleString('en-US') : (value || '—');

  return (
    <Box
      sx={{
        py: 1,
        borderTop: first ? 0 : `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5 }}>
        {showLabel && (
          <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem', minWidth: 0 }}>
            {label}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, whiteSpace: 'nowrap' }}>
          {showTrend && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: trendInk, fontSize: '0.875rem', fontWeight: 700 }}>
              {isPositive ? <TrendingUp sx={{ fontSize: 16 }} aria-hidden /> : <TrendingDown sx={{ fontSize: 16 }} aria-hidden />}
              <span>{trendValue}</span>
            </Box>
          )}
          <Typography component="span" sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>
            {shown}
          </Typography>
          {unit && (
            <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>
              {unit}
            </Typography>
          )}
        </Box>
      </Box>
      {caption && (
        <Typography data-testid="stat-caption" sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.25, lineHeight: 1.3 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
}
