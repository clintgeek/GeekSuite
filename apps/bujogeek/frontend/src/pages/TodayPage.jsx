import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useTaskContext } from '../context/TaskContext';
import { useToast } from '../components/shared/Toast';
import PageHeader from '../components/layout/PageHeader';
import OverdueSection from '../components/today/OverdueSection';
import TodaySection from '../components/today/TodaySection';
import CompletedSection from '../components/today/CompletedSection';
import InlineQuickAdd from '../components/today/InlineQuickAdd';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import TaskEditor from '../components/tasks/TaskEditor';
import useKeyboardNav from '../hooks/useKeyboardNav';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import { CREATE_NOTE } from '../graphql/notegeekMutations';
import { getTaskAge } from '../utils/taskAging';

const TodayPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingTask, setEditingTask] = useState(null);
  // Track whether fetchTasks has resolved for the current date.
  // Separate from context loading state because: (a) context starts as 'IDLE' string
  // not matching LoadingState enum, and (b) other views (Review, Plan) mutate the
  // shared tasks array, so Today renders stale foreign tasks until its own fetch completes.
  const [todayLoaded, setTodayLoaded] = useState(false);
  const toast = useToast();
  const [createNote] = useMutation(CREATE_NOTE);
  const {
    tasks,
    loading,
    fetchTasks,
    createTask,
    updateTaskStatus,
    deleteTask,
    saveDailyOrder,
    LoadingState,
  } = useTaskContext();

  useEffect(() => {
    setTodayLoaded(false);
    fetchTasks('daily', currentDate).finally(() => setTodayLoaded(true));
  }, [currentDate, fetchTasks]);

  const handleDateChange = useCallback((newDate) => {
    setCurrentDate(newDate);
  }, []);

  const handleStatusToggle = useCallback(async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus((task.id || task._id), newStatus);
  }, [updateTaskStatus]);

  const handleEdit = useCallback((task) => {
    setEditingTask(task);
  }, []);

  const handleDelete = useCallback(async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask((task.id || task._id));
    }
  }, [deleteTask]);

  const handleSaveAsNote = useCallback(async (task) => {
    try {
      await createNote({
        variables: {
          title: task.content,
          content: task.note || task.content,
          type: 'text',
          tags: task.tags || [],
        },
      });
      toast.success('Note saved to NoteGeek');
    } catch (err) {
      toast.error('Failed to save note to NoteGeek');
    }
  }, [createNote, toast]);

  const handleQuickAdd = useCallback(async (taskData) => {
    await createTask(taskData);
    // Refetch to get sorted list
    fetchTasks('daily', currentDate);
  }, [createTask, fetchTasks, currentDate]);

  // Split tasks into overdue, active, completed
  const { overdueTasks, activeTasks, completedTasks } = useMemo(() => {
    if (!Array.isArray(tasks)) {
      return { overdueTasks: [], activeTasks: [], completedTasks: [] };
    }

    const overdue = [];
    const active = [];
    const completed = [];

    tasks.forEach((task) => {
      if (task.status === 'completed') {
        completed.push(task);
      } else {
        const { days } = getTaskAge(task);
        if (days > 0) {
          overdue.push(task);
        } else {
          active.push(task);
        }
      }
    });

    // Sort overdue by age (oldest first)
    overdue.sort((a, b) => {
      const ageA = getTaskAge(a).days;
      const ageB = getTaskAge(b).days;
      return ageB - ageA;
    });

    return { overdueTasks: overdue, activeTasks: active, completedTasks: completed };
  }, [tasks]);

  // ─── Drag-and-drop reorder for Today's active tasks ───
  const [orderedActiveTasks, setOrderedActiveTasks] = useState(null);

  // Reset custom order when tasks change from server (new task added, status toggled, etc.)
  useEffect(() => {
    setOrderedActiveTasks(null);
  }, [tasks]);

  // The display list: custom order if user has reordered, otherwise the default
  const displayActiveTasks = orderedActiveTasks || activeTasks;

  const handleReorder = useCallback(
    (reordered) => {
      setOrderedActiveTasks(reordered);
      // Persist the order to the backend
      const dateKey = currentDate.toISOString().split('T')[0];
      const ids = reordered.map((t) => t.id || t._id);
      saveDailyOrder(dateKey, ids).catch((err) =>
        console.error('Failed to save task order:', err)
      );
    },
    [currentDate, saveDailyOrder]
  );

  const stats = useMemo(() => ({
    total: Array.isArray(tasks) ? tasks.length : 0,
    overdue: overdueTasks.length,
    completed: completedTasks.length,
  }), [tasks, overdueTasks, completedTasks]);

  const isLoading = !todayLoaded || loading === LoadingState.FETCHING;

  // ─── Keyboard navigation ───────────────────────────���─────
  // Flat list of navigable tasks: overdue then active (completed is collapsed)
  const navigableTasks = useMemo(
    () => [...overdueTasks, ...displayActiveTasks],
    [overdueTasks, displayActiveTasks]
  );

  const { focusedTaskId, clearFocus } = useKeyboardNav({
    tasks: navigableTasks,
    onToggle: handleStatusToggle,
    onEdit: handleEdit,
    onDelete: handleDelete,
    enabled: !isLoading && !editingTask,
  });

  useGlobalShortcuts();

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 1, sm: 3 },
        pb: 4,
      }}
    >
      <PageHeader
        date={currentDate}
        onDateChange={handleDateChange}
        stats={stats}
      />

      {/* Writing surface — always visible, never gated on loading */}
      <InlineQuickAdd
        onAdd={handleQuickAdd}
        autoFocus={!isLoading && displayActiveTasks.length === 0 && overdueTasks.length === 0}
      />

      {isLoading ? (
        <Box sx={{ mt: 1 }}>
          <SkeletonLoader rows={6} />
        </Box>
      ) : (
        <>
          <OverdueSection
            tasks={overdueTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            focusedTaskId={focusedTaskId}
          />

          <TodaySection
            tasks={displayActiveTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            focusedTaskId={focusedTaskId}
            onReorder={handleReorder}
          />

          <CompletedSection
            tasks={completedTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
          />
        </>
      )}

      <TaskEditor
        open={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        task={editingTask}
      />
    </Box>
  );
};

export default TodayPage;
