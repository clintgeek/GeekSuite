import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  InputBase,
  Chip,
  Collapse,
  useTheme,
  CircularProgress,
} from '@mui/material';
import { Search, Hash, ChevronDown, ChevronRight } from 'lucide-react';
import { isToday, isPast } from 'date-fns';
import { apolloClient } from '../apolloClient';
import { GET_TASK_TAGS, GET_TASKS_BY_TAG } from '../graphql/queries';
import TaskRow from '../components/tasks/TaskRow';
import TaskEditor from '../components/tasks/TaskEditor';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import { useTaskContext } from '../context/TaskContext';
import { colors } from '../theme/colors';

const AUTH_CONFIG = { withCredentials: true };

const TagsPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { updateTaskStatus, deleteTask } = useTaskContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [allTags, setAllTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState(null);
  const [tagTasks, setTagTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});

  // Fetch tasks when a tag is selected
  const handleSelectTag = useCallback(async (tag) => {
    setSelectedTag(tag);
    setSearchParams({ tag }, { replace: true });
    setTasksLoading(true);
    try {
      const { data } = await apolloClient.query({ query: GET_TASKS_BY_TAG, variables: { tag }, fetchPolicy: 'network-only' });
      setTagTasks(data.tasksByTag || []);
    } catch {
      setTagTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [setSearchParams]);

  // Fetch all tags on mount
  useEffect(() => {
    const fetchTags = async () => {
      setTagsLoading(true);
      try {
        const { data } = await apolloClient.query({ query: GET_TASK_TAGS, fetchPolicy: 'network-only' });
        setAllTags(data.taskTags || []);
      } catch {
        setAllTags([]);
      } finally {
        setTagsLoading(false);
      }
    };
    fetchTags();
  }, []);

  // Auto-select tag from ?tag= query param
  useEffect(() => {
    const tagParam = searchParams.get('tag');
    if (tagParam && allTags.length > 0 && !selectedTag) {
      const match = allTags.find(t => t.tag === tagParam);
      if (match) handleSelectTag(tagParam);
    }
  }, [searchParams, allTags, selectedTag, handleSelectTag]);

  // Refresh current tag's tasks after a status toggle or delete
  const refreshTagTasks = useCallback(async () => {
    if (!selectedTag) return;
    try {
      const { data } = await apolloClient.query({ query: GET_TASKS_BY_TAG, variables: { tag: selectedTag }, fetchPolicy: 'network-only' });
      setTagTasks(data.tasksByTag || []);
    } catch { /* ignore */ }
  }, [selectedTag]);

  const handleStatusToggle = useCallback(async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus(task.id || task._id, newStatus);
    refreshTagTasks();
  }, [updateTaskStatus, refreshTagTasks]);

  const handleDelete = useCallback(async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask(task.id || task._id);
      refreshTagTasks();
    }
  }, [deleteTask, refreshTagTasks]);

  const handleEdit = useCallback((task) => {
    setEditingTask(task);
  }, []);

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return allTags;
    const q = search.toLowerCase();
    return allTags.filter(t => t.tag.toLowerCase().includes(q));
  }, [allTags, search]);

  // Group tasks by time period for chronological display
  const groupedTasks = useMemo(() => {
    if (!tagTasks.length) return [];

    const groups = {
      overdue: { label: 'Overdue', tasks: [] },
      today: { label: 'Today', tasks: [] },
      upcoming: { label: 'Upcoming', tasks: [] },
      noDate: { label: 'Unscheduled', tasks: [] },
      completed: { label: 'Completed', tasks: [] },
    };

    tagTasks.forEach((task) => {
      if (task.status === 'completed') {
        groups.completed.tasks.push(task);
      } else if (!task.dueDate) {
        groups.noDate.tasks.push(task);
      } else {
        const due = new Date(task.dueDate);
        if (isToday(due)) {
          groups.today.tasks.push(task);
        } else if (isPast(due)) {
          groups.overdue.tasks.push(task);
        } else {
          groups.upcoming.tasks.push(task);
        }
      }
    });

    // Sort within each group
    ['overdue', 'today', 'upcoming', 'noDate'].forEach((key) => {
      groups[key].tasks.sort((a, b) => {
        const dA = a.dueDate ? new Date(a.dueDate) : new Date(a.createdAt);
        const dB = b.dueDate ? new Date(b.dueDate) : new Date(b.createdAt);
        return dA - dB;
      });
    });
    groups.completed.tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return Object.entries(groups)
      .filter(([, g]) => g.tasks.length > 0)
      .map(([key, g]) => ({ key, ...g }));
  }, [tagTasks]);

  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const totalCount = allTags.reduce((sum, t) => sum + t.count, 0);

  return (
    <Box
      sx={{
        maxWidth: 880,
        mx: 'auto',
        px: { xs: 1, sm: 3 },
        pb: 4,
      }}
    >
      {/* Page header */}
      <Box sx={{ px: { xs: 2, sm: 0.5 }, pt: { xs: 2.5, sm: 3.5 }, pb: 1 }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontWeight: 400,
            fontStyle: 'italic',
            color: isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300],
            mb: 0.5,
            letterSpacing: '0.01em',
          }}
        >
          {allTags.length} tag{allTags.length !== 1 ? 's' : ''} · {totalCount} tagged entr{totalCount !== 1 ? 'ies' : 'y'}
        </Typography>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            color: theme.palette.text.primary,
            lineHeight: 1.2,
          }}
        >
          Tags
        </Typography>
      </Box>

      {/* Search bar */}
      <Box sx={{ px: { xs: 0.5, sm: 0 }, mt: 2, mb: 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            borderRadius: '10px',
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.parchment.warm,
            border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100]}`,
            transition: 'all 0.15s ease',
            '&:focus-within': {
              borderColor: colors.primary[300],
              boxShadow: `0 0 0 3px ${isDark ? 'rgba(96,152,204,0.12)' : colors.primary[50]}`,
            },
          }}
        >
          <Search
            size={18}
            color={isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300]}
            style={{ flexShrink: 0 }}
          />
          <InputBase
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tags…"
            fullWidth
            sx={{
              fontSize: '0.9375rem',
              fontWeight: 450,
              color: theme.palette.text.primary,
              '& input::placeholder': {
                color: isDark ? 'rgba(255,255,255,0.2)' : colors.ink[300],
                opacity: 1,
              },
            }}
          />
        </Box>
      </Box>

      {/* Tag cloud */}
      {tagsLoading ? (
        <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
          <SkeletonLoader rows={2} />
        </Box>
      ) : allTags.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Hash
            size={40}
            color={isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}
            strokeWidth={1.5}
          />
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: '1rem',
              fontStyle: 'italic',
              color: theme.palette.text.disabled,
              mt: 2,
            }}
          >
            No tags yet. Add #tags to your tasks to organize them.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.75,
            }}
          >
            {filteredTags.map(({ tag, count }) => {
              const isActive = selectedTag === tag;
              return (
                <Chip
                  key={tag}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        component="span"
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: '0.8125rem',
                          fontWeight: isActive ? 600 : 450,
                        }}
                      >
                        #{tag}
                      </Typography>
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          color: isActive
                            ? 'rgba(255,255,255,0.7)'
                            : (isDark ? 'rgba(255,255,255,0.3)' : colors.ink[400]),
                          ml: 0.25,
                        }}
                      >
                        {count}
                      </Typography>
                    </Box>
                  }
                  onClick={() => handleSelectTag(tag)}
                  sx={{
                    height: 34,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isActive
                      ? colors.primary[500]
                      : (isDark ? 'rgba(255,255,255,0.06)' : colors.parchment.paper),
                    color: isActive
                      ? '#fff'
                      : theme.palette.text.primary,
                    border: `1px solid ${
                      isActive
                        ? colors.primary[500]
                        : (isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200])
                    }`,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      backgroundColor: isActive
                        ? colors.primary[600]
                        : (isDark ? 'rgba(255,255,255,0.08)' : colors.ink[50]),
                    },
                    '& .MuiChip-label': { px: 1.25 },
                  }}
                />
              );
            })}
          </Box>

          {filteredTags.length === 0 && search && (
            <Typography
              sx={{
                fontSize: '0.875rem',
                color: theme.palette.text.disabled,
                fontStyle: 'italic',
                mt: 2,
              }}
            >
              No tags match "{search}"
            </Typography>
          )}
        </Box>
      )}

      {/* Task results for selected tag */}
      {selectedTag && (
        <Box sx={{ mt: 3.5 }}>
          {/* Selected tag header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: { xs: 0.5, sm: 0 },
              mb: 2,
            }}
          >
            <Box
              sx={{
                width: 3,
                height: 28,
                borderRadius: 2,
                backgroundColor: colors.primary[400],
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '1.25rem', sm: '1.5rem' },
                fontWeight: 400,
                color: theme.palette.text.primary,
                lineHeight: 1.2,
              }}
            >
              #{selectedTag}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.8125rem',
                color: theme.palette.text.disabled,
                fontWeight: 500,
              }}
            >
              {tagTasks.length} entr{tagTasks.length !== 1 ? 'ies' : 'y'}
            </Typography>
          </Box>

          {tasksLoading ? (
            <SkeletonLoader rows={4} />
          ) : tagTasks.length === 0 ? (
            <Typography
              sx={{
                fontSize: '0.875rem',
                color: theme.palette.text.disabled,
                fontStyle: 'italic',
                px: { xs: 0.5, sm: 0 },
              }}
            >
              No entries found with this tag.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {groupedTasks.map(({ key, label, tasks: sectionTasks }) => {
                const isCollapsed = collapsedSections[key];
                const sectionColor =
                  key === 'overdue' ? colors.aging.overdue
                  : key === 'today' ? colors.aging.fresh
                  : key === 'completed' ? colors.task.completed
                  : colors.ink[400];

                return (
                  <Box key={key}>
                    {/* Section header */}
                    <Box
                      onClick={() => toggleSection(key)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        py: 0.75,
                        px: { xs: 0.5, sm: 0 },
                        cursor: 'pointer',
                        userSelect: 'none',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      {isCollapsed
                        ? <ChevronRight size={16} color={sectionColor} />
                        : <ChevronDown size={16} color={sectionColor} />
                      }
                      <Typography
                        sx={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: sectionColor,
                        }}
                      >
                        {label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          color: theme.palette.text.disabled,
                        }}
                      >
                        {sectionTasks.length}
                      </Typography>
                    </Box>

                    {/* Tasks */}
                    <Collapse in={!isCollapsed}>
                      <Box
                        sx={{
                          borderRadius: '10px',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100]}`,
                          overflow: 'hidden',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.paper,
                        }}
                      >
                        {sectionTasks.map((task, i) => (
                          <Box
                            key={task.id || task._id}
                            sx={{
                              borderBottom: i < sectionTasks.length - 1
                                ? `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : colors.ink[50]}`
                                : 'none',
                            }}
                          >
                            <TaskRow
                              task={task}
                              onStatusToggle={handleStatusToggle}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                            />
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      <TaskEditor
        open={Boolean(editingTask)}
        onClose={() => {
          setEditingTask(null);
          refreshTagTasks();
        }}
        task={editingTask}
      />
    </Box>
  );
};

export default TagsPage;
