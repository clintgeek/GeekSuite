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
  const toast = useToast();
  const [createNote] = useMutation(CREATE_NOTE);
  const {
    tasks,
    loading,
    fetchTasks,
    createTask,
    updateTaskStatus,
    deleteTask,
    LoadingState,
  } = useTaskContext();

  useEffect(() => {
    fetchTasks('daily', currentDate);
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

  const stats = useMemo(() => ({
    total: Array.isArray(tasks) ? tasks.length : 0,
    overdue: overdueTasks.length,
    completed: completedTasks.length,
  }), [tasks, overdueTasks, completedTasks]);

  const isLoading = loading === LoadingState.FETCHING;

  // ─── Keyboard navigation ───────────────────────────���─────
  // Flat list of navigable tasks: overdue then active (completed is collapsed)
  const navigableTasks = useMemo(
    () => [...overdueTasks, ...activeTasks],
    [overdueTasks, activeTasks]
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

      {isLoading ? (
        <Box sx={{ mt: 3 }}>
          <SkeletonLoader rows={6} />
        </Box>
      ) : (
        <>
          {/* Writing surface — always first. This is the start of the day. */}
          <InlineQuickAdd
            onAdd={handleQuickAdd}
            autoFocus={activeTasks.length === 0 && overdueTasks.length === 0}
          />

          <OverdueSection
            tasks={overdueTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            focusedTaskId={focusedTaskId}
          />

          <TodaySection
            tasks={activeTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            focusedTaskId={focusedTaskId}
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
