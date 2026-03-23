import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useTaskContext } from '../../context/TaskContext';
import TaskRow from '../tasks/TaskRow';
import SectionHeader from '../shared/SectionHeader';
import EmptyState from '../shared/EmptyState';
import SkeletonLoader from '../shared/SkeletonLoader';
import { getTaskAge } from '../../utils/taskAging';
import { normalizeTasks } from '../../utils/normalizeTasks';
import { colors } from '../../theme/colors';

const BacklogList = () => {
  const { tasks, loading, fetchAllTasks, updateTaskStatus, deleteTask, LoadingState } = useTaskContext();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  // Filter backlog tasks
  const backlogTasks = useMemo(() => {
    const taskArray = normalizeTasks(tasks);
    return taskArray
      .filter((task) => {
        return (
          task.status === 'migrated_back' ||
          task.isBacklog === true ||
          (task.status === 'pending' && getTaskAge(task).days > 7)
        );
      })
      .sort((a, b) => {
        const ageA = getTaskAge(a).days;
        const ageB = getTaskAge(b).days;
        return ageB - ageA;
      });
  }, [tasks]);

  // Separate stale tasks (30+ days)
  const { staleTasks, recentBacklog } = useMemo(() => {
    const stale = [];
    const recent = [];
    backlogTasks.forEach((task) => {
      if (getTaskAge(task).days >= 30) {
        stale.push(task);
      } else {
        recent.push(task);
      }
    });
    return { staleTasks: stale, recentBacklog: recent };
  }, [backlogTasks]);

  const handleStatusToggle = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus((task.id || task._id), newStatus);
  };

  const handleDelete = async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask((task.id || task._id));
    }
  };

  const isLoading = loading === LoadingState.FETCHING;

  if (isLoading) {
    return <SkeletonLoader rows={5} />;
  }

  if (backlogTasks.length === 0) {
    return (
      <EmptyState
        title="Backlog is empty"
        description="Everything is accounted for. Nothing parked."
      />
    );
  }

  return (
    <Box>
      {/* Review all button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ClipboardCheck size={16} />}
          onClick={() => navigate('/review')}
          sx={{
            fontSize: '0.8125rem',
            color: colors.primary[500],
            borderColor: colors.primary[200],
            '&:hover': {
              borderColor: colors.primary[500],
              backgroundColor: colors.primary[50],
              transform: 'none',
            },
          }}
        >
          Review All
        </Button>
      </Box>

      {/* Stale tasks (30+ days) */}
      {staleTasks.length > 0 && (
        <Box>
          <SectionHeader title="Stale" count={staleTasks.length} />
          <Box
            sx={{
              backgroundColor: `${colors.aging.stale}06`,
              borderRadius: '8px',
              overflow: 'hidden',
              mb: 2,
            }}
          >
            {staleTasks.map((task) => (
              <Box key={(task.id || task._id)}>
                <TaskRow
                  task={task}
                  onStatusToggle={handleStatusToggle}
                  onDelete={handleDelete}
                />
                {getTaskAge(task).days >= 30 && (
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      color: colors.aging.stale,
                      fontStyle: 'italic',
                      px: 2,
                      pb: 1,
                      ml: '44px',
                    }}
                  >
                    This has been here {getTaskAge(task).days} days — still relevant?
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Recent backlog */}
      {recentBacklog.length > 0 && (
        <Box>
          <SectionHeader title="Backlog" count={recentBacklog.length} />
          <Box
            sx={{
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {recentBacklog.map((task) => (
              <TaskRow
                key={(task.id || task._id)}
                task={task}
                onStatusToggle={handleStatusToggle}
                onDelete={handleDelete}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default BacklogList;
