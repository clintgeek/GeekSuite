import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isToday, isSameDay } from 'date-fns';
import { useTaskContext } from '../../context/TaskContext';
import TaskRow from '../tasks/TaskRow';
import SkeletonLoader from '../shared/SkeletonLoader';
import { normalizeTasks } from '../../utils/normalizeTasks';
import { colors } from '../../theme/colors';

const WeeklySpread = () => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { tasks, loading, fetchTasks, updateTaskStatus, deleteTask, LoadingState } = useTaskContext();

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  useEffect(() => {
    fetchTasks('weekly', weekStart);
  }, [weekStart, fetchTasks]);

  const handlePrevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const handleNextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const handleThisWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Group tasks by day
  const tasksByDay = useMemo(() => {
    const grouped = {};
    days.forEach((day) => {
      const key = format(day, 'yyyy-MM-dd');
      grouped[key] = [];
    });

    const taskArray = normalizeTasks(tasks);
    taskArray.forEach((task) => {
      if (task.dueDate) {
        const taskDate = format(new Date(task.dueDate), 'yyyy-MM-dd');
        if (grouped[taskDate]) {
          grouped[taskDate].push(task);
        }
      }
    });

    return grouped;
  }, [tasks, days]);

  const handleStatusToggle = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task._id, newStatus);
  };

  const handleDelete = async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask(task._id);
    }
  };

  const isCurrentWeek = isToday(weekStart) || (new Date() >= weekStart && new Date() <= weekEnd);
  const isLoading = loading === LoadingState.FETCHING;

  return (
    <Box>
      {/* Week navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="body2" sx={{ color: colors.ink[500], fontWeight: 500 }}>
          {format(weekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" onClick={handlePrevWeek} sx={{ color: colors.ink[400] }}>
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
                '&:hover': { borderColor: colors.primary[500], backgroundColor: colors.primary[50], transform: 'none' },
              }}
            >
              This Week
            </Button>
          )}
          <IconButton size="small" onClick={handleNextWeek} sx={{ color: colors.ink[400] }}>
            <ChevronRight size={20} />
          </IconButton>
        </Box>
      </Box>

      {isLoading ? (
        <SkeletonLoader rows={5} />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDay[key] || [];
            const today = isToday(day);

            return (
              <Box
                key={key}
                sx={{
                  borderRadius: '10px',
                  border: `1px solid ${today ? colors.primary[200] : colors.ink[100]}`,
                  backgroundColor: today ? `${colors.primary[50]}80` : colors.parchment.paper,
                  overflow: 'hidden',
                }}
              >
                {/* Day header row */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1,
                    borderBottom: dayTasks.length > 0 ? `1px solid ${today ? colors.primary[200] : colors.ink[100]}` : 'none',
                    backgroundColor: today ? colors.primary[50] : colors.ink[50],
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      color: today ? colors.primary[600] : colors.ink[400],
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      minWidth: 32,
                    }}
                  >
                    {format(day, 'EEE')}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1rem',
                      fontWeight: today ? 600 : 500,
                      color: today ? colors.primary[600] : colors.ink[800],
                      lineHeight: 1.2,
                    }}
                  >
                    {format(day, 'MMM d')}
                  </Typography>
                  {dayTasks.length === 0 && (
                    <Typography
                      sx={{ fontSize: '0.75rem', color: colors.ink[300], fontStyle: 'italic', ml: 1 }}
                    >
                      No tasks
                    </Typography>
                  )}
                </Box>

                {/* Tasks */}
                {dayTasks.length > 0 && (
                  <Box>
                    {dayTasks.map((task) => (
                      <Box key={task._id} sx={{ borderBottom: `1px solid ${colors.ink[50]}`, '&:last-child': { borderBottom: 'none' } }}>
                        <TaskRow
                          task={task}
                          onStatusToggle={handleStatusToggle}
                          onDelete={handleDelete}
                        />
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default WeeklySpread;
