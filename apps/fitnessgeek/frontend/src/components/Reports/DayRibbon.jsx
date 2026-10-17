import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { SectionLabel, Surface } from '../primitives';

/**
 * DayRibbon — horizontal-scroll ribbon of day cards for Reports.
 *
 * Each day is a small card: the day and date, the calories, one line of
 * macros in words ("P 165 · C 141 · F 70 g") and, when there's a target, a
 * status word. Only an over day gets a coloured edge — the plate's plum, the
 * same edge Home draws round a full plate. The word carries the meaning; the
 * colour only points at it (UX review 2026-10-17, D-8).
 *
 * Newest day first. The ribbon used to start scrolled to its right-hand end,
 * which on a phone left the first visible card cut in half at the left edge
 * (C10). Newest-first needs no scroll on open, so the card you see first is
 * whole, and the cut at the right is the hint that there's more.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDate = (dateStr) => {
  if (!dateStr) return { dayOfWeek: '', date: '' };
  // Parse YYYY-MM-DD as a local date (avoid timezone shift)
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return { dayOfWeek: WEEKDAYS[date.getDay()], date: `${MONTHS[date.getMonth()]} ${date.getDate()}` };
};

const commas = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/**
 * How a day's calories sit against the target, in a word. Null without a
 * target. `over` marks the two over states — the only ones that get colour.
 */
export function dayStatus(calories, target) {
  if (!target) return null;
  const pct = calories / target;
  if (pct < 0.85) return { label: 'Under', over: false };
  if (pct <= 1.05) return { label: 'On target', over: false };
  if (pct <= 1.15) return { label: 'A bit over', over: true };
  return { label: 'Over', over: true };
}

/** "P 165 · C 141 · F 70 g" */
export function macroLine(day) {
  const g = (k) => Math.round(Number(day?.[k]) || 0);
  return `P ${g('protein')} · C ${g('carbs')} · F ${g('fat')} g`;
}

const DayCard = ({ day, calorieTarget }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  // The plate's over edge (PlateRing): plum, never red.
  const overEdge = theme.palette.produce?.snack?.text || theme.palette.secondary.main;

  const { dayOfWeek, date } = formatDate(day.date);
  const calories = Math.round(day.calories || 0);
  const status = dayStatus(calories, calorieTarget);

  return (
    <Box
      component="li"
      data-testid="day-card"
      data-over={status?.over ? 'true' : 'false'}
      sx={{
        listStyle: 'none',
        position: 'relative',
        flexShrink: 0,
        width: { xs: 140, sm: 152 },
        borderRadius: '14px',
        backgroundColor: isDark ? alpha(ink, 0.04) : theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        p: { xs: 1.5, sm: 1.75 },
        ...(status?.over && {
          borderTop: `3px solid ${overEdge}`,
          paddingTop: '10px',
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 1 }}>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: ink, lineHeight: 1 }}>
          {dayOfWeek}
        </Typography>
        <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', fontWeight: 600, color: muted }}>
          {date}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.75 }}>
        <Typography
          component="span"
          sx={{ fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.75rem', sm: '2rem' }, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color: ink }}
        >
          {commas(calories)}
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: muted }}>
          cal
        </Typography>
      </Box>

      <Typography data-testid="day-macros" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem', color: ink, lineHeight: 1.4 }}>
        {macroLine(day)}
      </Typography>

      {status && (
        <Typography
          data-testid="day-status"
          sx={{ fontSize: '0.8125rem', fontWeight: status.over ? 700 : 600, color: status.over ? ink : muted, mt: 0.5 }}
        >
          {status.label}
        </Typography>
      )}
    </Box>
  );
};

const DayRibbon = ({ daily = [], calorieTarget, rangeLabel }) => {
  const theme = useTheme();

  if (!daily || daily.length === 0) {
    return (
      <Surface>
        <SectionLabel sx={{ mb: 1.5 }}>Each day</SectionLabel>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', py: 2, textAlign: 'center' }}>
          No food logs in this range.
        </Typography>
      </Surface>
    );
  }

  const newestFirst = [...daily].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <Surface padded={false}>
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 2,
          pb: 1.25,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: 2,
          borderBottom: `1px dashed ${theme.palette.divider}`,
        }}
      >
        <SectionLabel>{`Each day (${daily.length} logged)`}</SectionLabel>
        {rangeLabel && (
          <Typography data-testid="day-ribbon-range" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>
            {rangeLabel}
          </Typography>
        )}
      </Box>

      <Box
        component="ul"
        // A horizontally scrolling strip must be reachable by keyboard, or its
        // off-screen days are unreachable without a pointer (axe
        // scrollable-region-focusable; first checked 2026-09-23).
        tabIndex={0}
        aria-label="Each day, newest first, scrolls sideways"
        sx={{
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          display: 'flex',
          gap: 1.25,
          m: 0,
          px: { xs: 2, sm: 2.5 },
          py: 2,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          scrollPaddingInline: { xs: 16, sm: 20 },
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            background: alpha(theme.palette.text.primary, 0.2),
            borderRadius: 3,
          },
          '& > *': { scrollSnapAlign: 'start' },
        }}
      >
        {newestFirst.map((day) => (
          <DayCard key={day.date} day={day} calorieTarget={calorieTarget} />
        ))}
      </Box>
    </Surface>
  );
};

export default DayRibbon;
