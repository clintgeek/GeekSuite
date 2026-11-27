import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { LabelPanel, Tag } from '../primitives';

/**
 * DayRibbon — horizontal-scroll ribbon of day cards for Reports.
 *
 * Each day is a small card: the day and date, the calories, one line of
 * macros in words ("P 165 · C 141 · F 70 g") and, when there's a target, a
 * status Tag. Rounded cards with a hairline edge; an over day's Tag takes the
 * warning tone, the others the neutral wash. The word carries the meaning (UX
 * review 2026-10-17, D-8).
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
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;

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
        // Wide enough that "P 165 · C 141 · F 70 g" stays on one line (it
        // wrapped, leaving "70 g" alone on a second), and stretching to fill
        // the row when there are only a few days, so a desktop has no empty
        // third of a card row.
        flex: { xs: '0 0 172px', sm: '1 0 176px' },
        maxWidth: { sm: 240 },
        borderRadius: '12px',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        // 12px: the suite's spacing unit is 4px.
        p: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: ink, lineHeight: 1 }}>
          {dayOfWeek}
        </Typography>
        <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', fontWeight: 600, color: muted }}>
          {date}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
        <Typography
          component="span"
          sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: ink }}
        >
          {commas(calories)}
        </Typography>
        <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: muted }}>
          cal
        </Typography>
      </Box>

      <Typography data-testid="day-macros" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem', color: muted, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
        {macroLine(day)}
      </Typography>

      {status && (
        <Box component="span" data-testid="day-status" sx={{ display: 'block', mt: 2 }}>
          <Tag tone={status.over ? 'warning' : undefined}>
            {status.label}
          </Tag>
        </Box>
      )}
    </Box>
  );
};

const DayRibbon = ({ daily = [], calorieTarget, rangeLabel }) => {
  const theme = useTheme();

  if (!daily || daily.length === 0) {
    return (
      <LabelPanel title="Each day">
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          Nothing logged in these days yet. Log a meal on Today and it shows here.
        </Typography>
      </LabelPanel>
    );
  }

  const newestFirst = [...daily].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <LabelPanel
      title={`Each day (${daily.length} logged)`}
      // The dates sit on the title's own row. As a line of their own under
      // it they were orphaned at the far right of a desktop card.
      action={rangeLabel ? (
        <Typography
          component="span"
          data-testid="day-ribbon-range"
          sx={{ color: 'text.secondary', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {rangeLabel}
        </Typography>
      ) : undefined}
    >
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
          gap: 3,
          m: 0,
          pt: 0,
          pb: 2,
          px: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            background: alpha(theme.palette.text.primary, 0.3),
            borderRadius: 999,
          },
          '& > *': { scrollSnapAlign: 'start' },
        }}
      >
        {newestFirst.map((day) => (
          <DayCard key={day.date} day={day} calorieTarget={calorieTarget} />
        ))}
      </Box>
    </LabelPanel>
  );
};

export default DayRibbon;
