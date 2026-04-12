import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button, useTheme } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTaskContext } from '../../context/TaskContext';
import { normalizeTasks } from '../../utils/normalizeTasks';
import { colors } from '../../theme/colors';
import { getTaskAge, getAgingColor } from '../../utils/taskAging';

const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * MonthlyCalendar — the editorial planner spread.
 *
 * Aesthetic: this is a bullet journal app, so the grid uses DOTTED rules —
 * a nod to the dot-grid notebooks bullet journaling was born on. Fraunces
 * sets the month name as a page headline, weekdays are rendered in italic
 * serif for warmth, day numbers are tabular-nums for alignment, and task
 * marks sit as small colored glyphs at the bottom of each day cell.
 */
const MonthlyCalendar = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [direction, setDirection] = useState(0);
  const { tasks, loading, fetchTasks, LoadingState } = useTaskContext();
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks('monthly', currentMonth);
  }, [currentMonth, fetchTasks]);

  const handlePrevMonth = () => {
    setDirection(-1);
    setCurrentMonth((m) => subMonths(m, 1));
  };
  const handleNextMonth = () => {
    setDirection(1);
    setCurrentMonth((m) => addMonths(m, 1));
  };
  const handleThisMonth = () => {
    setDirection(isSameMonth(currentMonth, new Date()) ? 0 : (new Date() > currentMonth ? 1 : -1));
    setCurrentMonth(new Date());
  };

  const isCurrentMonth = isSameMonth(currentMonth, new Date());

  // Build calendar grid (always 6 weeks = 42 cells for stable layout)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Per-day task marks + running tallies for the stats line
  const { taskMarks, monthStats } = useMemo(() => {
    const marks = {};
    const stats = { total: 0, overdue: 0, done: 0 };
    const arr = normalizeTasks(tasks);
    arr.forEach((task) => {
      if (!task.dueDate) return;
      const key = format(new Date(task.dueDate), 'yyyy-MM-dd');
      if (!marks[key]) marks[key] = [];
      const { level } = getTaskAge(task);
      const isDone = task.status === 'completed';
      const color = isDone ? colors.aging.fresh : getAgingColor(level);
      marks[key].push({ color, done: isDone });

      // Only count tasks whose dueDate falls inside the visible month
      if (isSameMonth(new Date(task.dueDate), currentMonth)) {
        stats.total += 1;
        if (isDone) stats.done += 1;
        if (!isDone && (level === 'overdue' || level === 'stale')) stats.overdue += 1;
      }
    });
    return { taskMarks: marks, monthStats: stats };
  }, [tasks, currentMonth]);

  const handleDayClick = (day) => {
    if (!isSameMonth(day, currentMonth)) return;
    navigate('/today');
  };

  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200]}`;
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;

  // Stable key for AnimatePresence — one per month
  const monthKey = format(currentMonth, 'yyyy-MM');

  return (
    <Box>
      {/* ─── Editorial header ───────────────────────────────────── */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        {/* Italic caption */}
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontWeight: 400,
            color: captionInk,
            letterSpacing: '0.01em',
            mb: 0.75,
          }}
        >
          {isCurrentMonth ? 'Looking ahead' : 'On the page'}
        </Typography>

        {/* Month headline + navigation row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '2rem', sm: '2.75rem' },
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: primaryInk,
                fontOpticalSizing: 'auto',
              }}
            >
              {format(currentMonth, 'MMMM')}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontVariantNumeric: 'tabular-nums',
                fontSize: { xs: '0.875rem', sm: '1rem' },
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: mutedInk,
                pb: { xs: 0.25, sm: 0.5 },
              }}
            >
              {format(currentMonth, 'yyyy')}
            </Typography>
          </Box>

          {/* Navigation */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <IconButton
              size="small"
              onClick={handlePrevMonth}
              sx={{ color: mutedInk }}
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </IconButton>
            {!isCurrentMonth && (
              <Button
                size="small"
                onClick={handleThisMonth}
                variant="outlined"
                sx={{
                  fontSize: '0.7rem',
                  py: 0.25,
                  px: 1,
                  minWidth: 'auto',
                  color: colors.primary[500],
                  borderColor: colors.primary[200],
                  '&:hover': {
                    borderColor: colors.primary[500],
                    backgroundColor: colors.primary[50],
                    transform: 'none',
                  },
                }}
              >
                This Month
              </Button>
            )}
            <IconButton
              size="small"
              onClick={handleNextMonth}
              sx={{ color: mutedInk }}
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </IconButton>
          </Box>
        </Box>

        {/* Stats line */}
        {monthStats.total > 0 && (
          <Typography
            variant="body2"
            sx={{
              color: captionInk,
              mt: 1,
              fontSize: '0.8125rem',
            }}
          >
            {monthStats.total} {monthStats.total === 1 ? 'task' : 'tasks'} on the page
            {monthStats.overdue > 0 && (
              <Box component="span" sx={{ color: colors.aging.overdue }}>
                {' · '}
                {monthStats.overdue} overdue
              </Box>
            )}
            {monthStats.done > 0 && (
              <Box component="span" sx={{ color: colors.aging.fresh }}>
                {' · '}
                {monthStats.done} done
              </Box>
            )}
          </Typography>
        )}
      </Box>

      {/* ─── Weekday row — Fraunces italic ───────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          mb: 0.5,
          px: { xs: 0, sm: 0.5 },
        }}
      >
        {WEEKDAYS_FULL.map((day, idx) => (
          <Box key={day} sx={{ py: 1, textAlign: 'center' }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                fontWeight: 400,
                color: mutedInk,
                letterSpacing: '0.01em',
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                {day}
              </Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                {WEEKDAYS_SHORT[idx]}
              </Box>
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ─── Calendar grid — dotted ruled, crossfade on month change ── */}
      <Box sx={{ position: 'relative', minHeight: { xs: 320, sm: 440 } }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={monthKey}
            initial={{ opacity: 0, y: direction * 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -direction * 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: '100%' }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderTop: dottedRule,
                borderLeft: dottedRule,
              }}
            >
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const marks = taskMarks[key] || [];
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);
                const dayNum = format(day, 'd');

                return (
                  <Box
                    key={key}
                    onClick={() => handleDayClick(day)}
                    sx={{
                      position: 'relative',
                      minHeight: { xs: 52, sm: 76 },
                      borderRight: dottedRule,
                      borderBottom: dottedRule,
                      // Top rule on today is a thin primary line — like highlighting with a fountain pen
                      borderTop: today ? `2px solid ${colors.primary[500]}` : 'none',
                      marginTop: today ? '-1px' : 0, // keep grid spacing even
                      backgroundColor: today
                        ? (isDark ? 'rgba(96, 152, 204, 0.1)' : colors.parchment.warm)
                        : inMonth
                        ? 'transparent'
                        : (isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.015)'),
                      cursor: inMonth ? 'pointer' : 'default',
                      transition: 'background-color 180ms ease',
                      p: { xs: 0.75, sm: 1 },
                      display: 'flex',
                      flexDirection: 'column',
                      '&:hover': inMonth && !today
                        ? {
                            backgroundColor: isDark
                              ? 'rgba(255,255,255,0.03)'
                              : 'rgba(245, 240, 235, 0.5)',
                          }
                        : {},
                    }}
                    aria-label={`${format(day, 'EEEE MMMM d')}${marks.length ? `, ${marks.length} task${marks.length !== 1 ? 's' : ''}` : ''}${today ? ', today' : ''}`}
                  >
                    {/* Day number — Fraunces tabular */}
                    <Typography
                      sx={{
                        fontFamily: '"Fraunces", serif',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        fontWeight: today ? 600 : inMonth ? 500 : 400,
                        lineHeight: 1,
                        color: today
                          ? colors.primary[600]
                          : inMonth
                          ? primaryInk
                          : (isDark ? 'rgba(255,255,255,0.2)' : colors.ink[300]),
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {dayNum}
                    </Typography>

                    {/* "today" small tag */}
                    {today && (
                      <Typography
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: '0.5rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: colors.primary[500],
                          mt: 0.125,
                          lineHeight: 1,
                          display: { xs: 'none', sm: 'block' },
                        }}
                      >
                        Today
                      </Typography>
                    )}

                    {/* Task marks — aging-colored glyphs at the bottom */}
                    {inMonth && marks.length > 0 && (
                      <Box
                        sx={{
                          mt: 'auto',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: { xs: 0.375, sm: 0.5 },
                          alignItems: 'center',
                        }}
                      >
                        {marks.slice(0, 5).map((mark, i) => (
                          <Box
                            key={i}
                            sx={{
                              width: { xs: 5, sm: 6 },
                              height: { xs: 5, sm: 6 },
                              borderRadius: '50%',
                              backgroundColor: mark.color,
                              opacity: mark.done ? 0.45 : 1,
                              // Subtle inner shadow gives a hand-inked feel
                              boxShadow: mark.done
                                ? 'none'
                                : `inset 0 0 0 0.5px rgba(0,0,0,0.2)`,
                            }}
                          />
                        ))}
                        {marks.length > 5 && (
                          <Typography
                            sx={{
                              fontFamily: '"IBM Plex Mono", monospace',
                              fontVariantNumeric: 'tabular-nums',
                              fontSize: '0.5625rem',
                              fontWeight: 600,
                              color: mutedInk,
                              lineHeight: 1,
                              ml: 0.25,
                            }}
                          >
                            +{marks.length - 5}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </motion.div>
        </AnimatePresence>
      </Box>

      {/* ─── Legend — tiny, editorial ────────────────────────────── */}
      <Box
        sx={{
          mt: 2.5,
          display: 'flex',
          flexWrap: 'wrap',
          gap: { xs: 1.5, sm: 2.5 },
          rowGap: 1,
          px: 0.5,
        }}
      >
        {[
          { color: colors.aging.fresh, label: 'Today / done' },
          { color: colors.aging.warning, label: 'Aging' },
          { color: colors.aging.overdue, label: 'Overdue' },
          { color: colors.aging.stale, label: 'Stale' },
        ].map((item) => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: item.color,
                boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.2)`,
              }}
            />
            <Typography
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.625rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: mutedInk,
              }}
            >
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default MonthlyCalendar;
