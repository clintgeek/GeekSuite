/**
 * The top of the week spread, set like the day page's: the week's span large
 * in the display face, the ribbon on this week, and the way to other weeks
 * and back to the day (W7, W8).
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { relativeWeekName, weekRangeLabel } from '../../lib/days.js';
import { DISPLAY_FONT } from '../../theme/theme.js';

const TARGET = 48;

const navButtonSx = (theme) => ({
  width: TARGET,
  height: TARGET,
  color: 'text.primary',
  border: `1px solid ${theme.palette.day.border}`,
  borderRadius: 2.5,
});

export default function WeekHeader({ monday, isThisWeek, now, onPrev, onNext, onThisWeek, dayHref }) {
  const relative = relativeWeekName(monday, now);

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 1.5,
        px: { xs: 1.5, sm: 2.5 },
        pt: 'max(16px, env(safe-area-inset-top))',
        pb: 1.5,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 22 }}>
          <Typography
            data-testid="week-relative"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isThisWeek ? 'secondary.main' : 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            {isThisWeek ? <Box aria-hidden sx={{ width: 18, height: 3, borderRadius: 2, bgcolor: 'secondary.main' }} /> : null}
            {relative || 'Week'}
          </Typography>
        </Box>
        <Typography
          component="h1"
          data-testid="week-title"
          data-week={monday}
          sx={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 600,
            // The day page's size (components/DayHeader.jsx).
            fontSize: { xs: '1.75rem', sm: 'clamp(2.25rem, 5vw, 2.75rem)' },
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {weekRangeLabel(monday, now)}
        </Typography>
      </Box>

      <Box component="nav" aria-label="Weeks" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 'none' }}>
        {!isThisWeek ? (
          <Button
            onClick={onThisWeek}
            data-testid="week-this"
            variant="outlined"
            sx={(theme) => ({ minHeight: TARGET, borderRadius: 2.5, px: 1.75, whiteSpace: 'nowrap', color: 'secondary.main', borderColor: theme.palette.secondary.main })}
          >
            This week
          </Button>
        ) : null}
        <Button
          component={RouterLink}
          to={dayHref}
          data-testid="week-to-day"
          variant="outlined"
          sx={(theme) => ({ minHeight: TARGET, minWidth: TARGET, borderRadius: 2.5, px: 1.75, color: 'text.primary', borderColor: theme.palette.day.border })}
        >
          Day
        </Button>
        <Tooltip title="Previous week">
          <IconButton onClick={onPrev} aria-label="Previous week" data-testid="week-prev" sx={navButtonSx}>
            <ChevronLeftRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title="Next week">
          <IconButton onClick={onNext} aria-label="Next week" data-testid="week-next" sx={navButtonSx}>
            <ChevronRightRounded />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
