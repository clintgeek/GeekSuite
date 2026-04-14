import React, { useMemo, useRef, useEffect } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { SectionLabel, StatNumber, Surface } from '../primitives';

/**
 * DayRibbon — horizontal-scroll ribbon of day cards for Reports.
 *
 * Each day becomes a small "ticket stub" showing:
 *  - Day-of-week (serif)
 *  - Date (mono)
 *  - Calorie total (big mono)
 *  - 4-dot macro spine (protein/carbs/fat/fiber) with fill based on % of target
 *  - Goal compliance edge (colored top border when target is known)
 *
 * Replaces the dense table that fell apart on mobile. Scrolls horizontally,
 * tap-friendly, readable at a glance.
 */

const MACROS = [
  { key: 'protein', label: 'P', color: '#10B981' },
  { key: 'carbs', label: 'C', color: '#F59E0B' },
  { key: 'fat', label: 'F', color: '#EF4444' },
  { key: 'fiber', label: 'Fi', color: '#8B5CF6' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return { dayOfWeek: '---', day: '--', month: '---' };
  // Parse YYYY-MM-DD as local date (avoid timezone shift)
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return {
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    iso: dateStr,
  };
};

const DayCard = ({ day, calorieTarget, macroTargets }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;

  const { dayOfWeek, day: dayNum, month } = formatDate(day.date);
  const calories = Math.round(day.calories || 0);

  // Compliance edge: colored top border if we have a target
  const compliance = useMemo(() => {
    if (!calorieTarget || calorieTarget === 0) return null;
    const pct = calories / calorieTarget;
    if (pct < 0.85) return { color: theme.palette.info.main, label: 'under' };
    if (pct <= 1.05) return { color: theme.palette.success.main, label: 'on target' };
    if (pct <= 1.15) return { color: theme.palette.warning.main, label: 'slightly over' };
    return { color: theme.palette.error.main, label: 'over' };
  }, [calories, calorieTarget, theme]);

  const tooltipLabel = compliance
    ? `${month} ${dayNum}: ${calories} kcal (${compliance.label})`
    : `${month} ${dayNum}: ${calories} kcal`;

  return (
    <Tooltip title={tooltipLabel} placement="top" arrow>
      <Box
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: { xs: 132, sm: 148 },
          borderRadius: '14px',
          backgroundColor: isDark ? alpha(ink, 0.04) : '#FDFCFB',
          border: `1px solid ${theme.palette.divider}`,
          p: { xs: 1.5, sm: 1.75 },
          pt: compliance ? 1.5 : 1.5,
          transition:
            'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease, border-color 180ms ease',
          cursor: 'default',
          // Compliance edge as a colored top bar
          ...(compliance && {
            borderTop: `3px solid ${compliance.color}`,
            paddingTop: '10px',
          }),
          // Perforated edge — subtle visual tie to the tray receipt aesthetic
          '&::before': compliance
            ? {
                content: '""',
                position: 'absolute',
                top: -3,
                left: 14,
                right: 14,
                height: 3,
                background: `repeating-linear-gradient(90deg, ${compliance.color} 0 8px, transparent 8px 12px)`,
                opacity: 0.7,
              }
            : {},
          '&:hover': {
            transform: 'translateY(-2px)',
            borderColor: alpha(ink, 0.28),
            boxShadow: isDark
              ? '0 8px 20px -10px rgba(0, 0, 0, 0.5)'
              : '0 8px 20px -14px rgba(28, 25, 23, 0.18)',
          },
        }}
      >
        {/* Date — day of week (serif) + day number (mono) */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 1 }}>
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.125rem',
              fontWeight: 400,
              color: ink,
              lineHeight: 1,
              letterSpacing: '-0.01em',
            }}
          >
            {dayOfWeek}
          </Typography>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: muted,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {month} {dayNum}
          </Typography>
        </Box>

        {/* Big calorie number */}
        <StatNumber
          value={calories}
          unit="kcal"
          size="display"
          sx={{ mb: 1.25, display: 'flex' }}
        />

        {/* Macro spine — 4 dots with partial fill */}
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 0.5,
          }}
        >
          {MACROS.map(({ key, label, color }) => {
            const value = Math.round(day[key] || 0);
            const target = macroTargets?.[key];
            const pct = target ? Math.min(1, value / target) : 0;
            return (
              <Box
                key={key}
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.375,
                }}
              >
                {/* Tick label */}
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.5625rem',
                    fontWeight: 700,
                    color: muted,
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                  }}
                >
                  {label}
                </Typography>
                {/* Vertical fill bar */}
                <Box
                  sx={{
                    width: 4,
                    height: 22,
                    borderRadius: 2,
                    backgroundColor: alpha(color, isDark ? 0.16 : 0.12),
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {target && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${pct * 100}%`,
                        backgroundColor: color,
                        borderRadius: 2,
                        transition: 'height 360ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  )}
                </Box>
                {/* Value */}
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    color: ink,
                    lineHeight: 1,
                  }}
                >
                  {value}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Tooltip>
  );
};

const DayRibbon = ({ daily = [], macroTargets, calorieTarget, title = 'Daily Totals', rangeLabel }) => {
  const theme = useTheme();
  const scrollRef = useRef(null);

  // On mount, scroll to the right end (most recent day)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [daily.length]);

  if (!daily || daily.length === 0) {
    return (
      <Surface>
        <SectionLabel sx={{ mb: 1.5 }}>{title}</SectionLabel>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', py: 2, textAlign: 'center' }}>
          No food logs in this range.
        </Typography>
      </Surface>
    );
  }

  return (
    <Surface padded={false}>
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 2,
          pb: 1.25,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderBottom: `1px dashed ${theme.palette.divider}`,
        }}
      >
        <SectionLabel count={daily.length}>{title}</SectionLabel>
        {rangeLabel && (
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'text.secondary',
              letterSpacing: '0.02em',
            }}
          >
            {rangeLabel}
          </Typography>
        )}
      </Box>

      {/* Horizontal ribbon */}
      <Box
        ref={scrollRef}
        sx={{
          display: 'flex',
          gap: 1.25,
          px: { xs: 2, sm: 2.5 },
          py: 2,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          // Custom thin scrollbar
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            background: alpha(theme.palette.text.primary, 0.2),
            borderRadius: 3,
          },
          '& > *': { scrollSnapAlign: 'start' },
        }}
      >
        {daily.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            calorieTarget={calorieTarget}
            macroTargets={macroTargets}
          />
        ))}
      </Box>

      {/* Compliance legend */}
      {calorieTarget && (
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 1.5, sm: 2 },
            flexWrap: 'wrap',
            alignItems: 'center',
            px: { xs: 2, sm: 2.5 },
            pb: 2,
            pt: 0.5,
            borderTop: `1px dashed ${theme.palette.divider}`,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'text.secondary',
            }}
          >
            Goal:
          </Typography>
          {[
            { color: theme.palette.info.main, label: 'under' },
            { color: theme.palette.success.main, label: 'on target' },
            { color: theme.palette.warning.main, label: 'slightly over' },
            { color: theme.palette.error.main, label: 'over' },
          ].map(({ color, label }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 3, borderRadius: 2, backgroundColor: color }} />
              <Typography
                sx={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  textTransform: 'capitalize',
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Surface>
  );
};

export default DayRibbon;
