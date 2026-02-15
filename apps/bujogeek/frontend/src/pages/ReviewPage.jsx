import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTaskContext } from '../context/TaskContext';
import ReviewCard from '../components/review/ReviewCard';
import ReviewProgress from '../components/review/ReviewProgress';
import ReviewComplete from '../components/review/ReviewComplete';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import { getTaskAge } from '../utils/taskAging';
import { normalizeTasks } from '../utils/normalizeTasks';
import { colors } from '../theme/colors';
import { format, addDays } from 'date-fns';

const ReviewPage = () => {
  const [mode, setMode] = useState('endofday');
  const [reviewedIds, setReviewedIds] = useState(new Set());
  const {
    tasks,
    loading,
    fetchTasks,
    fetchAllTasks,
    updateTask,
    updateTaskStatus,
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

  // Filter to aging tasks only
  const agingTasks = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed') return false;
      if (reviewedIds.has(task._id)) return false;
      if (mode === 'endofday') {
        // End of day: show today's incomplete tasks
        return task.status === 'pending';
      } else {
        // Weekly: show all aging tasks (days > 0)
        const { days } = getTaskAge(task);
        return days > 0;
      }
    });
  }, [tasks, mode, reviewedIds]);

  const totalToReview = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray.filter((task) => {
      if (task.status === 'completed') return false;
      if (mode === 'endofday') {
        return task.status === 'pending';
      } else {
        const { days } = getTaskAge(task);
        return days > 0;
      }
    }).length;
  }, [tasks, mode]);

  const markReviewed = useCallback((taskId) => {
    setReviewedIds((prev) => new Set([...prev, taskId]));
  }, []);

  const handleKeep = useCallback(async (task) => {
    // Keep on today — update dueDate to today
    await updateTask(task._id, { ...task, dueDate: new Date().toISOString() });
    markReviewed(task._id);
  }, [updateTask, markReviewed]);

  const handleMoveForward = useCallback(async (task) => {
    // Move to tomorrow
    const tomorrow = addDays(new Date(), 1);
    await updateTask(task._id, {
      ...task,
      dueDate: tomorrow.toISOString(),
      status: 'migrated_future',
    });
    markReviewed(task._id);
  }, [updateTask, markReviewed]);

  const handleBacklog = useCallback(async (task) => {
    await updateTask(task._id, {
      ...task,
      status: 'migrated_back',
      dueDate: null,
      isBacklog: true,
    });
    markReviewed(task._id);
  }, [updateTask, markReviewed]);

  const handleDelete = useCallback(async (task) => {
    if (window.confirm('Delete this task permanently?')) {
      await deleteTask(task._id);
      markReviewed(task._id);
    }
  }, [deleteTask, markReviewed]);

  const isLoading = loading === LoadingState.FETCHING;
  const allReviewed = agingTasks.length === 0 && !isLoading && totalToReview > 0;
  const nothingToReview = totalToReview === 0 && !isLoading;

  return (
    <Box
      sx={{
        maxWidth: 640,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 3 },
        pb: 4,
      }}
    >
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h2"
          sx={{ color: colors.ink[900], mb: 0.5 }}
        >
          Review
        </Typography>
        <Typography variant="body2" sx={{ color: colors.ink[400] }}>
          {nothingToReview
            ? 'Nothing to review right now.'
            : `${agingTasks.length} tasks need your attention`
          }
        </Typography>
      </Box>

      {/* Mode toggle */}
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, val) => val && setMode(val)}
        size="small"
        sx={{ mb: 3 }}
      >
        <ToggleButton
          value="endofday"
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            textTransform: 'none',
            px: 2,
            '&.Mui-selected': {
              backgroundColor: colors.primary[50],
              color: colors.primary[600],
              borderColor: colors.primary[200],
              '&:hover': {
                backgroundColor: colors.primary[100],
              },
            },
          }}
        >
          End of Day
        </ToggleButton>
        <ToggleButton
          value="weekly"
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            textTransform: 'none',
            px: 2,
            '&.Mui-selected': {
              backgroundColor: colors.primary[50],
              color: colors.primary[600],
              borderColor: colors.primary[200],
              '&:hover': {
                backgroundColor: colors.primary[100],
              },
            },
          }}
        >
          Weekly Review
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Progress */}
      {totalToReview > 0 && (
        <ReviewProgress total={totalToReview} reviewed={reviewedIds.size} />
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader rows={4} />
      ) : allReviewed ? (
        <ReviewComplete />
      ) : nothingToReview ? (
        <ReviewComplete />
      ) : (
        <Box>
          {agingTasks.map((task) => (
            <ReviewCard
              key={task._id}
              task={task}
              onKeep={handleKeep}
              onMoveForward={handleMoveForward}
              onBacklog={handleBacklog}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ReviewPage;
