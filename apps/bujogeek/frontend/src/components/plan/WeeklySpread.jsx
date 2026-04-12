import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button, useTheme } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isToday,
  isSameMonth,
} from 'date-fns';
import { useTaskContext } from '../../context/TaskContext';
import TaskRow from '../tasks/TaskRow';
import SkeletonLoader from '../shared/SkeletonLoader';
import { normalizeTasks } from '../../utils/normalizeTasks';
import { colors } from '../../theme/colors';
import { getTaskAge } from '../../utils/taskAging';

/**
 * WeeklySpread — seven planner pages, stacked.
 *
 * Each day is a horizontal row with a gutter on the left holding the
 * Fraunces italic day name + mono date, and a task list on the right. The
 * active day is emphasised with a warm parchment fill and a primary left
 * rule. Dotted horizontal dividers separate days — continuing the bullet-
 * journal dot grid aesthetic.
 */
const WeeklySpread = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [direction, setDirection] = useState(0);
  const { tasks, loading, fetchTasks, updateTaskStatus, deleteTask, LoadingState } =
    useTaskContext();

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  useEffect(() => {
    fetchTasks('weekly', weekStart);
  }, [weekStart, fetchTasks]);

  const handlePrevWeek = () => {
    setDirection(-1);
    setWeekStart((w) => subWeeks(w, 1));
  };
  const handleNextWeek = () => {
    setDirection(1);
    setWeekStart((w) => addWeeks(w, 1));
  };
  const handleThisWeek = () => {
    const now = startOfWeek(new Date(), { weekStartsOn: 1 });
    setDirection(now > weekStart ? 1 : -1);
    setWeekStart(now);
  };

  // Group tasks by day + compute spread-level stats
  const { tasksByDay, weekStats } = useMemo(() => {
    const grouped = {};
    days.forEach((day) => {
      grouped[format(day, 'yyyy-MM-dd')] = [];
    });

    const stats = { total: 0, overdue: 0, done: 0 };
    const arr = normalizeTasks(tasks);
    arr.forEach((task) => {
      if (!task.dueDate) return;
      const taskDate = format(new Date(task.dueDate), 'yyyy-MM-dd');
      if (grouped[taskDate]) {
        grouped[taskDate].push(task);
        stats.total += 1;
        if (task.status === 'completed') {
          stats.done += 1;
        } else {
          const { level } = getTaskAge(task);
          if (level === 'overdue' || level === 'stale') stats.overdue += 1;
        }
      }
    });

    return { tasksByDay: grouped, weekStats: stats };
  }, [tasks, days]);

  const handleStatusToggle = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task.id || task._id, newStatus);
  };

  const handleDelete = async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask(task.id || task._id);
    }
  };

  const now = new Date();
  const isCurrentWeek = now >= weekStart && now <= weekEnd;
  const isLoading = loading === LoadingState.FETCHING;

  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

  // Format the week headline — "Feb 10 — 16" if same month, "Feb 26 — Mar 4" otherwise
  const weekHeadline = useMemo(() => {
    const sameMonth = isSameMonth(weekStart, weekEnd);
    if (sameMonth) {
      return `${format(weekStart, 'MMMM d')} — ${format(weekEnd, 'd')}`;
    }
    return `${format(weekStart, 'MMM d')} — ${format(weekEnd, 'MMM d')}`;
  }, [weekStart, weekEnd]);

  const weekKey = format(weekStart, 'yyyy-MM-dd');

  return (
    <Box>
      {/* ─── Editorial header ───────────────────────────────────── */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
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
          {isCurrentWeek ? 'This week' : weekStart < now ? 'Looking back' : 'Looking ahead'}
        </Typography>

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
                fontSize: { xs: '1.75rem', sm: '2.5rem' },
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: primaryInk,
                fontOpticalSizing: 'auto',
              }}
            >
              {weekHeadline}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontVariantNumeric: 'tabular-nums',
                fontSize: { xs: '0.8125rem', sm: '1rem' },
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: mutedInk,
                pb: { xs: 0.25, sm: 0.5 },
              }}
            >
              {format(weekStart, 'yyyy')}
            </Typography>
          </Box>

          {/* Navigation */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <IconButton
              size="small"
              onClick={handlePrevWeek}
              sx={{ color: mutedInk }}
              aria-label="Previous week"
            >
              <ChevronLeft size={20} />
            </IconButton>
            {!isCurrentWeek && (
              <Button
                size="small"
                onClick={handleThisWeek}
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
                This Week
              </Button>
            )}
            <IconButton
              size="small"
              onClick={handleNextWeek}
              sx={{ color: mutedInk }}
              aria-label="Next week"
            >
              <ChevronRight size={20} />
            </IconButton>
          </Box>
        </Box>

        {/* Stats line */}
        {weekStats.total > 0 && (
          <Typography
            variant="body2"
            sx={{
              color: captionInk,
              mt: 1,
              fontSize: '0.8125rem',
            }}
          >
            {weekStats.total} {weekStats.total === 1 ? 'task' : 'tasks'} on the spread
            {weekStats.overdue > 0 && (
              <Box component="span" sx={{ color: colors.aging.overdue }}>
                {' · '}
                {weekStats.overdue} overdue
              </Box>
            )}
            {weekStats.done > 0 && (
              <Box component="span" sx={{ color: colors.aging.fresh }}>
                {' · '}
                {weekStats.done} done
              </Box>
            )}
          </Typography>
        )}
      </Box>

      {/* ─── Day rows ───────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonLoader rows={5} />
      ) : (
        <Box
          sx={{
            borderTop: dottedRule,
          }}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={weekKey}
              initial={{ opacity: 0, y: direction * 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -direction * 6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayTasks = tasksByDay[key] || [];
                const today = isToday(day);
                const taskCount = dayTasks.length;

                return (
                  <Box
                    key={key}
                    sx={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderBottom: dottedRule,
                      backgroundColor: today
                        ? (isDark ? 'rgba(96, 152, 204, 0.08)' : colors.parchment.warm)
                        : 'transparent',
                      borderLeft: today
                        ? `3px solid ${colors.primary[500]}`
                        : `3px solid transparent`,
                      transition: 'background-color 200ms ease',
                      minHeight: 72,
                    }}
                  >
                    {/* Gutter — day name + date + today tag */}
                    <Box
                      sx={{
                        flexShrink: 0,
                        width: { xs: 88, sm: 120 },
                        py: { xs: 1.5, sm: 1.75 },
                        px: { xs: 1.25, sm: 2 },
                        borderRight: dottedRule,
                      }}
                    >
                      <Typography
                        sx={{
                          fontFamily: '"Fraunces", serif',
                          fontStyle: 'italic',
                          fontSize: { xs: '1.0625rem', sm: '1.25rem' },
                          fontWeight: today ? 500 : 400,
                          color: today ? colors.primary[600] : primaryInk,
                          lineHeight: 1.1,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                          {format(day, 'EEEE')}
                        </Box>
                        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                          {format(day, 'EEE')}
                        </Box>
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: today ? colors.primary[500] : mutedInk,
                          mt: 0.375,
                        }}
                      >
                        {format(day, 'MMM d')}
                      </Typography>
                      {today && (
                        <Typography
                          sx={{
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '0.5625rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            color: colors.primary[500],
                            mt: 0.625,
                            px: 0.625,
                            py: 0.125,
                            display: 'inline-block',
                            border: `1px solid ${colors.primary[300]}`,
                            borderRadius: '3px',
                            backgroundColor: isDark ? 'rgba(96,152,204,0.1)' : 'rgba(96,152,204,0.06)',
                          }}
                        >
                          Today
                        </Typography>
                      )}
                      {taskCount > 0 && (
                        <Typography
                          sx={{
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            color: mutedInk,
                            mt: today ? 0.5 : 0.625,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                        </Typography>
                      )}
                    </Box>

                    {/* Task list */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {dayTasks.length > 0 ? (
                        dayTasks.map((task, idx) => (
                          <Box
                            key={task.id || task._id}
                            sx={{
                              borderBottom:
                                idx < dayTasks.length - 1 ? dottedRule : 'none',
                            }}
                          >
                            <TaskRow
                              task={task}
                              onStatusToggle={handleStatusToggle}
                              onDelete={handleDelete}
                            />
                          </Box>
                        ))
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            height: '100%',
                            px: { xs: 2, sm: 3 },
                            py: { xs: 2, sm: 0 },
                          }}
                        >
                          <Typography
                            sx={{
                              fontFamily: '"Fraunces", serif',
                              fontStyle: 'italic',
                              fontSize: '0.875rem',
                              color: captionInk,
                              letterSpacing: '0.005em',
                            }}
                          >
                            — nothing on this day
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </Box>
      )}
    </Box>
  );
};

export default WeeklySpread;
