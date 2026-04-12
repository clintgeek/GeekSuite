import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskContext } from '../context/TaskContext';
import ReviewCard from '../components/review/ReviewCard';
import ReviewProgress from '../components/review/ReviewProgress';
import ReviewComplete from '../components/review/ReviewComplete';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import { getTaskAge } from '../utils/taskAging';
import { normalizeTasks } from '../utils/normalizeTasks';
import { colors } from '../theme/colors';
import { addDays } from 'date-fns';
import { toLocalDateString } from '../utils/dateUtils';

const MODES = [
  { value: 'endofday', label: 'End of Day' },
  { value: 'weekly', label: 'Weekly Review' },
];

const ReviewPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [mode, setMode] = useState('endofday');
  const [reviewedIds, setReviewedIds] = useState(new Set());
  const {
    tasks,
    loading,
    fetchTasks,
    fetchAllTasks,
    updateTask,
    deleteTask,
    LoadingState,
  } = useTaskContext();

  // Fetch tasks based on mode
  useEffect(() => {
    if (mode === 'endofday') {
      fetchTasks('daily', new Date());
    } else {
      fetchAllTasks();
    }
    setReviewedIds(new Set());
  }, [mode, fetchTasks, fetchAllTasks]);

  const agingTasks = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed') return false;
      if (reviewedIds.has((task.id || task._id))) return false;
      if (mode === 'endofday') {
        return task.status === 'pending';
      }
      const { days } = getTaskAge(task);
      return days > 0;
    });
  }, [tasks, mode, reviewedIds]);

  const totalToReview = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed') return false;
      if (mode === 'endofday') return task.status === 'pending';
      const { days } = getTaskAge(task);
      return days > 0;
    }).length;
  }, [tasks, mode]);

  const markReviewed = useCallback((taskId) => {
    setReviewedIds((prev) => new Set([...prev, taskId]));
  }, []);

  const handleKeep = useCallback(
    async (task) => {
      const todayStr = toLocalDateString(new Date());
      await updateTask((task.id || task._id), { ...task, dueDate: todayStr });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleMoveForward = useCallback(
    async (task) => {
      const tomorrowStr = toLocalDateString(addDays(new Date(), 1));
      await updateTask((task.id || task._id), {
        ...task,
        dueDate: tomorrowStr,
        status: 'migrated_future',
      });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleBacklog = useCallback(
    async (task) => {
      await updateTask((task.id || task._id), {
        ...task,
        status: 'migrated_back',
        dueDate: null,
        isBacklog: true,
      });
      markReviewed((task.id || task._id));
    },
    [updateTask, markReviewed]
  );

  const handleDelete = useCallback(
    async (task) => {
      if (window.confirm('Delete this task permanently?')) {
        await deleteTask((task.id || task._id));
        markReviewed((task.id || task._id));
      }
    },
    [deleteTask, markReviewed]
  );

  const isLoading = loading === LoadingState.FETCHING;
  const allReviewed = agingTasks.length === 0 && !isLoading && totalToReview > 0;
  const nothingToReview = totalToReview === 0 && !isLoading;

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const primaryInk = theme.palette.text.primary;
  const hairlineRule = `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`;

  // Editorial caption based on state
  const eyebrowText =
    nothingToReview
      ? 'A quiet moment'
      : allReviewed
      ? 'Well tended'
      : 'End of the day';

  const statsText =
    nothingToReview
      ? 'Nothing to review right now.'
      : allReviewed
      ? 'You tended to everything.'
      : `${agingTasks.length} ${agingTasks.length === 1 ? 'task waits' : 'tasks wait'} for your attention`;

  return (
    <Box
      sx={{
        maxWidth: 680,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: { xs: 2.5, sm: 3.5 },
        pb: 4,
      }}
    >
      {/* ─── Editorial masthead ─────────────────────────────────── */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontWeight: 400,
            color: captionInk,
            letterSpacing: '0.01em',
            mb: 0.5,
          }}
        >
          {eyebrowText}
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            fontWeight: 500,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: primaryInk,
            fontOpticalSizing: 'auto',
          }}
        >
          Review
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: captionInk,
            mt: 0.75,
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontFamily: '"Fraunces", serif',
          }}
        >
          {statsText}
        </Typography>
      </Box>

      {/* ─── Editorial segmented mode toggle ────────────────────── */}
      <Box
        role="tablist"
        aria-label="Review mode"
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: { xs: 2.5, sm: 3.5 },
          borderBottom: hairlineRule,
          mb: 3,
          px: 0.5,
        }}
      >
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <Box
              key={m.value}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setMode(m.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMode(m.value);
                }
              }}
              sx={{
                position: 'relative',
                py: 1.25,
                cursor: 'pointer',
                transition: 'color 200ms ease',
                '&:hover': {
                  color: isDark ? 'rgba(255,255,255,0.85)' : colors.ink[800],
                },
                '&:focus-visible': {
                  outline: `2px solid ${colors.primary[400]}`,
                  outlineOffset: 4,
                  borderRadius: 2,
                },
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: { xs: '0.9375rem', sm: '1.0625rem' },
                  fontWeight: active ? 500 : 400,
                  color: active ? primaryInk : mutedInk,
                  letterSpacing: '-0.005em',
                  lineHeight: 1.2,
                  transition: 'color 200ms ease',
                }}
              >
                {m.label}
              </Typography>
              {active && (
                <motion.div
                  layoutId="review-mode-underline"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2,
                    backgroundColor: colors.primary[500],
                    borderRadius: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {/* Progress */}
      {totalToReview > 0 && !allReviewed && (
        <ReviewProgress total={totalToReview} reviewed={reviewedIds.size} />
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader rows={4} />
      ) : allReviewed || nothingToReview ? (
        <ReviewComplete />
      ) : (
        <Box>
          <AnimatePresence mode="popLayout">
            {agingTasks.map((task) => (
              <motion.div
                key={(task.id || task._id)}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 32, transition: { duration: 0.24 } }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <ReviewCard
                  task={task}
                  onKeep={handleKeep}
                  onMoveForward={handleMoveForward}
                  onBacklog={handleBacklog}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>
      )}
    </Box>
  );
};

export default ReviewPage;
