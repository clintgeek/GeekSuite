import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { ChevronRight, CheckCircleOutline, ErrorOutline, InfoOutlined } from '@mui/icons-material';
import Surface from './Surface.jsx';
import { LabelBar } from './Label.jsx';

/**
 * One health number on a small card: its name, the latest value and unit, a
 * line of context, and (when there is enough history) a sparkline. With `to`
 * the whole tile is a link to that number's page, and says so with a chevron.
 *
 *   <MetricTile label="Weight" value="219.9" unit="lb" caption="7-day avg"
 *     spark={[221, 220.4, 219.9]} to="/weight" />
 *
 * `status` ({ label, tone }) is a word with an icon — "Normal", "High" — so a
 * reading that needs attention never says so by colour alone. `tone` is
 * "success" | "warning" | "error" | "info".
 *
 * `progress` (0–100) draws a thin bar under the value (steps toward a day's
 * count). `spark` is oldest-first; fewer than three points draws nothing.
 */
const STATUS_ICON = { success: CheckCircleOutline, warning: ErrorOutline, error: ErrorOutline, info: InfoOutlined };

function Sparkline({ points, color }) {
  const nums = (points || []).map(Number).filter(Number.isFinite);
  if (nums.length < 3) return null;
  const w = 72;
  const h = 28;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const xy = nums.map((n, i) => [
    (i / (nums.length - 1)) * (w - 4) + 2,
    h - 3 - ((n - min) / span) * (h - 6),
  ]);
  // Stretched to the tile's width under the value, so the number and its
  // unit always share one line however narrow the tile is.
  return (
    <svg aria-hidden data-testid="metric-spark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={xy.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function MetricTile({ label, value, unit, caption, status, spark, progress, progressLabel, to, sx, ...rest }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const StatusIcon = status ? STATUS_ICON[status.tone] || InfoOutlined : null;
  const shown = value === null || value === undefined || value === '' ? '—' : value;
  const linkProps = to ? { component: RouterLink, to } : {};

  return (
    <Surface
      {...linkProps}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
        minHeight: 116,
        p: { xs: 3.5, sm: 4 },
        color: 'inherit',
        textDecoration: 'none',
        ...(to ? {
          '@media (hover: hover)': { '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.5) } },
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        } : {}),
        ...sx,
      }}
      {...rest}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary', lineHeight: 1.3 }}>
          {label}
        </Typography>
        {to && <ChevronRight aria-hidden sx={{ fontSize: 18, color: 'text.secondary', mr: -1 }} />}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
        <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          {typeof shown === 'number' ? shown.toLocaleString('en-US') : shown}
        </Typography>
        {unit && shown !== '—' && (
          <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{unit}</Typography>
        )}
      </Box>
      <Sparkline points={spark} color={theme.palette.primary.main} />
      {progress != null && (
        <LabelBar value={progress} label={progressLabel || `${Math.round(progress)} percent`} height={6} sx={{ my: 1 }} />
      )}

      {status && (
        <Box
          component="span"
          data-testid="metric-status"
          sx={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.5,
            borderRadius: 999,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'text.primary',
            bgcolor: alpha(theme.palette[status.tone]?.main || theme.palette.text.primary, isDark ? 0.22 : 0.12),
          }}
        >
          <StatusIcon aria-hidden sx={{ fontSize: 15, color: `${status.tone}.main` }} />
          {status.label}
        </Box>
      )}

      {caption && (
        <Typography data-testid="stat-caption" sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.35 }}>
          {caption}
        </Typography>
      )}
    </Surface>
  );
}
