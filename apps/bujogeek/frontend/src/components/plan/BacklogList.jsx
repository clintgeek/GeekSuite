import { useEffect, useMemo } from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
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

/**
 * BacklogList — parked tasks, with aging urgency. The stale section (30+
 * days) gets a plum-tinted background and a gentle prompt asking whether
 * each task is still relevant — a soft nag, not a loud alert.
 */
const BacklogList = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { tasks, loading, fetchAllTasks, updateTaskStatus, deleteTask, LoadingState } =
    useTaskContext();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  // Filter + sort backlog tasks
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
      .sort((a, b) => getTaskAge(b).days - getTaskAge(a).days);
  }, [tasks]);

  const { staleTasks, recentBacklog } = useMemo(() => {
    const stale = [];
    const recent = [];
    backlogTasks.forEach((task) => {
      if (getTaskAge(task).days >= 30) stale.push(task);
      else recent.push(task);
    });
    return { staleTasks: stale, recentBacklog: recent };
  }, [backlogTasks]);

  const handleStatusToggle = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task.id || task._id, newStatus);
  };

  const handleDelete = async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask(task.id || task._id);
    }
  };

  const isLoading = loading === LoadingState.FETCHING;

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;

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
      {/* ─── Editorial caption + review-all action ─────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: captionInk,
              letterSpacing: '0.01em',
              mb: 0.25,
            }}
          >
            Parked for later
          </Typography>
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: mutedInk,
            }}
          >
            {backlogTasks.length} {backlogTasks.length === 1 ? 'task' : 'tasks'}
            {staleTasks.length > 0 && (
              <Box component="span" sx={{ color: colors.aging.stale }}>
                {' · '}
                {staleTasks.length} stale
              </Box>
            )}
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={<ClipboardCheck size={16} />}
          onClick={() => navigate('/review')}
          sx={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
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

      {/* ─── Stale (30+ days) — plum-tinted warning zone ──────── */}
      {staleTasks.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <SectionHeader title="Stale" count={staleTasks.length} />
          <Box
            sx={{
              backgroundColor: isDark
                ? 'rgba(139, 77, 106, 0.12)'
                : `${colors.aging.stale}0A`,
              border: `1px solid ${isDark ? 'rgba(139, 77, 106, 0.3)' : `${colors.aging.stale}26`}`,
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {staleTasks.map((task, idx) => {
              const age = getTaskAge(task).days;
              return (
                <Box
                  key={task.id || task._id}
                  sx={{
                    borderBottom: idx < staleTasks.length - 1 ? dottedRule : 'none',
                  }}
                >
                  <TaskRow
                    task={task}
                    onStatusToggle={handleStatusToggle}
                    onDelete={handleDelete}
                  />
                  {age >= 30 && (
                    <Typography
                      sx={{
                        fontFamily: '"Fraunces", serif',
                        fontStyle: 'italic',
                        fontSize: '0.75rem',
                        color: colors.aging.stale,
                        px: 2,
                        pb: 1.25,
                        ml: '44px',
                        letterSpacing: '0.005em',
                      }}
                    >
                      — this has been here {age} days. Still relevant?
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ─── Recent backlog ────────────────────────────────────── */}
      {recentBacklog.length > 0 && (
        <Box>
          <SectionHeader title="Backlog" count={recentBacklog.length} />
          <Box
            sx={{
              borderTop: dottedRule,
            }}
          >
            {recentBacklog.map((task, idx) => (
              <Box
                key={task.id || task._id}
                sx={{
                  borderBottom:
                    idx < recentBacklog.length - 1 ? dottedRule : dottedRule,
                }}
              >
                <TaskRow
                  task={task}
                  onStatusToggle={handleStatusToggle}
                  onDelete={handleDelete}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default BacklogList;
