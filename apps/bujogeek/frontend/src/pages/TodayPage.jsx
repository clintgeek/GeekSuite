import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useApolloClient, useMutation } from '@apollo/client';
import { addDays, format, isWithinInterval, startOfDay } from 'date-fns';
import { useTaskContext } from '../context/TaskContext';
import PageHeader from '../components/layout/PageHeader';
import OverdueSection from '../components/today/OverdueSection';
import TodaySection from '../components/today/TodaySection';
import UpcomingSection from '../components/today/UpcomingSection';
import CompletedSection from '../components/today/CompletedSection';
import BlockedSection from '../components/today/BlockedSection';
import InlineQuickAdd from '../components/today/InlineQuickAdd';
import QuickAddSheet from '../components/today/QuickAddSheet';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import TaskEditor from '../components/tasks/TaskEditor';
import BlockTaskDialog from '../components/tasks/BlockTaskDialog';
import useKeyboardNav from '../hooks/useKeyboardNav';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import { CREATE_NOTE } from '../graphql/notegeekMutations';
import { GET_MONTHLY_TASKS, GET_BLOCKED_TASKS } from '../graphql/queries';
import { getTaskAge } from '../utils/taskAging';
import { useToast } from '@geeksuite/ui';

const TodayPage = () => {
  const theme = useTheme();
  // Below `md` the writing surface moves to a FAB-opened sheet, so the inline
  // field is hidden — two entry points on one page would be one too many.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingTask, setEditingTask] = useState(null);
  // Tasks due within the next 7 days (fetched separately from the daily view)
  const [upcomingRangeTasks, setUpcomingRangeTasks] = useState([]);
  // Parked tasks — their own query, because the gateway keeps blocked tasks out
  // of the daily/weekly/monthly log views entirely.
  const [blockedTasks, setBlockedTasks] = useState([]);
  // The task whose "Block…" action is open, if any.
  const [blockingTask, setBlockingTask] = useState(null);
  // Track whether fetchTasks has resolved for the current date.
  // Separate from context loading state because: (a) context starts as 'IDLE' string
  // not matching LoadingState enum, and (b) other views (Review, Plan) mutate the
  // shared tasks array, so Today renders stale foreign tasks until its own fetch completes.
  const [todayLoaded, setTodayLoaded] = useState(false);
  const { notify } = useToast();
  const [createNote] = useMutation(CREATE_NOTE);
  const apolloClient = useApolloClient();
  const {
    tasks,
    loading,
    fetchTasks,
    createTask,
    updateTaskStatus,
    blockTask,
    unblockTask,
    deleteTask,
    saveDailyOrder,
    LoadingState,
  } = useTaskContext();

  useEffect(() => {
    setTodayLoaded(false);
    fetchTasks('daily', currentDate).finally(() => setTodayLoaded(true));
  }, [currentDate, fetchTasks]);

  // ─── Upcoming: tasks due within the next 7 days after the viewed date ───
  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await apolloClient.query({
        query: GET_MONTHLY_TASKS,
        variables: {
          startDate: format(addDays(currentDate, 1), 'yyyy-MM-dd'),
          endDate: format(addDays(currentDate, 7), 'yyyy-MM-dd'),
        },
        fetchPolicy: 'no-cache',
      });
      setUpcomingRangeTasks(res.data?.monthlyTasks || []);
    } catch (err) {
      console.error('Failed to fetch upcoming tasks:', err);
    }
  }, [apolloClient, currentDate]);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  // ─── Blocked: the parked shelf at the bottom of the page ───
  const fetchBlocked = useCallback(async () => {
    try {
      const res = await apolloClient.query({
        query: GET_BLOCKED_TASKS,
        fetchPolicy: 'no-cache',
      });
      setBlockedTasks(res.data?.blockedTasks || []);
    } catch (err) {
      console.error('Failed to fetch blocked tasks:', err);
    }
  }, [apolloClient]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleDateChange = useCallback((newDate) => {
    setCurrentDate(newDate);
  }, []);

  // Any status change can move a task across the shelves — completing or
  // cancelling a parked task un-parks it server-side — so the blocked list is
  // refetched alongside Upcoming.
  const handleStatusToggle = useCallback(async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatus((task.id || task._id), newStatus);
    fetchUpcoming();
    fetchBlocked();
  }, [updateTaskStatus, fetchUpcoming, fetchBlocked]);

  const handleCancelToggle = useCallback(async (task) => {
    const newStatus = task.status === 'cancelled' ? 'pending' : 'cancelled';
    await updateTaskStatus((task.id || task._id), newStatus);
    fetchUpcoming();
    fetchBlocked();
  }, [updateTaskStatus, fetchUpcoming, fetchBlocked]);

  const handleEdit = useCallback((task) => {
    setEditingTask(task);
  }, []);

  const handleDelete = useCallback(async (task) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask((task.id || task._id));
      fetchBlocked();
    }
  }, [deleteTask, fetchBlocked]);

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
      notify('Note saved to NoteGeek', { tone: 'success' });
    } catch (err) {
      notify('Failed to save note to NoteGeek', { tone: 'error' });
    }
  }, [createNote, notify]);

  const handleBlockRequest = useCallback((task) => {
    setBlockingTask(task);
  }, []);

  const handleBlockConfirm = useCallback(async (reason) => {
    const task = blockingTask;
    setBlockingTask(null);
    if (!task) return;
    const blocked = await blockTask((task.id || task._id), reason);
    if (!blocked) return; // the context has already surfaced the error
    notify('Task blocked', { tone: 'success' });
    // Every list here is fetched no-cache, so refetch the ones that change:
    // the task leaves the log and joins the parked shelf.
    fetchTasks('daily', currentDate);
    fetchUpcoming();
    fetchBlocked();
  }, [blockingTask, blockTask, notify, fetchTasks, currentDate, fetchUpcoming, fetchBlocked]);

  const handleUnblock = useCallback(async (task) => {
    const unblocked = await unblockTask((task.id || task._id));
    if (!unblocked) return;
    notify('Task unblocked', { tone: 'success' });
    fetchTasks('daily', currentDate);
    fetchUpcoming();
    fetchBlocked();
  }, [unblockTask, notify, fetchTasks, currentDate, fetchUpcoming, fetchBlocked]);

  const handleQuickAdd = useCallback(async (taskData) => {
    // `~blocked [reason]` is a two-step create: the mutation has no blocked
    // input, so the task is created and then parked.
    const { blocked, blockedReason, ...fields } = taskData;
    let created;
    try {
      created = await createTask(fields);
    } catch {
      // createTask has already surfaced the error via the task context snackbar;
      // skip the refetch so the failed entry isn't silently dropped from view.
      // `false` also keeps the quick-add sheet open with the entry still typed.
      return false;
    }
    if (blocked && created) {
      const parked = await blockTask((created.id || created._id), blockedReason);
      if (parked) {
        notify('Task added and blocked', { tone: 'success' });
        fetchBlocked();
      }
    }
    // Refetch to get sorted list
    fetchTasks('daily', currentDate);
    return true;
  }, [createTask, blockTask, notify, fetchBlocked, fetchTasks, currentDate]);

  // Split tasks into overdue, active, completed
  const { overdueTasks, activeTasks, completedTasks } = useMemo(() => {
    if (!Array.isArray(tasks)) {
      return { overdueTasks: [], activeTasks: [], completedTasks: [] };
    }

    const overdue = [];
    const active = [];
    const completed = [];

    tasks.forEach((task) => {
      // A parked task has left the log — it belongs to BlockedSection, not to
      // Today/Carried forward. (The gateway already filters it out of
      // dailyTasks; this guards the window between a block and the refetch.)
      if (task.status === 'blocked') return;
      if (task.status === 'completed' || task.status === 'cancelled') {
        // Cancelled sinks alongside completed — struck as irrelevant, out of
        // the active/overdue flow, tucked into the collapsed section.
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

  // Upcoming = pending tasks with a due date within (viewed date, viewed date + 7],
  // excluding anything already shown on this page (dedupe against daily tasks).
  const upcomingTasks = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const windowStart = addDays(dayStart, 1);
    const windowEnd = addDays(dayStart, 7);
    const dailyIds = new Set(
      (Array.isArray(tasks) ? tasks : []).map((t) => String(t.id || t._id))
    );

    return (Array.isArray(upcomingRangeTasks) ? upcomingRangeTasks : [])
      .filter((task) => {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
        if (task.status === 'blocked') return false;
        if (!task.dueDate) return false;
        if (dailyIds.has(String(task.id || task._id))) return false;
        return isWithinInterval(startOfDay(new Date(task.dueDate)), {
          start: windowStart,
          end: windowEnd,
        });
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [upcomingRangeTasks, tasks, currentDate]);

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
      const dateKey = format(currentDate, 'yyyy-MM-dd');
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
    blocked: blockedTasks.length,
  }), [tasks, overdueTasks, completedTasks, blockedTasks]);

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
    onCancel: handleCancelToggle,
    enabled: !isLoading && !editingTask && !blockingTask,
  });

  useGlobalShortcuts();

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 1, sm: 3 },
        // Room for the FAB below `md` so it never sits on the last entry.
        pb: { xs: 11, md: 4 },
      }}
    >
      <PageHeader
        date={currentDate}
        onDateChange={handleDateChange}
        stats={stats}
      />

      {/* Writing surface — always visible, never gated on loading. At `md`+
          it is the inline field; below it, the FAB's sheet (same component). */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <InlineQuickAdd
          onAdd={handleQuickAdd}
          autoFocus={
            !isMobile && !isLoading && displayActiveTasks.length === 0 && overdueTasks.length === 0
          }
        />
      </Box>

      <QuickAddSheet
        label="Add task"
        sheetTitle="New entry"
        onAdd={handleQuickAdd}
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
            onCancel={handleCancelToggle}
            onBlock={handleBlockRequest}
            focusedTaskId={focusedTaskId}
          />

          <TodaySection
            tasks={displayActiveTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            onCancel={handleCancelToggle}
            onBlock={handleBlockRequest}
            focusedTaskId={focusedTaskId}
            onReorder={handleReorder}
          />

          <UpcomingSection
            tasks={upcomingTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            onCancel={handleCancelToggle}
            onBlock={handleBlockRequest}
            focusedTaskId={focusedTaskId}
          />

          {/* The parked shelf sits above Completed. Always rendered, even at zero. */}
          <BlockedSection
            tasks={blockedTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            onCancel={handleCancelToggle}
            onUnblock={handleUnblock}
            focusedTaskId={focusedTaskId}
          />

          {/* Last on the page: what got done. */}
          <CompletedSection
            tasks={completedTasks}
            onStatusToggle={handleStatusToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaveAsNote={handleSaveAsNote}
            onCancel={handleCancelToggle}
          />
        </>
      )}

      <TaskEditor
        open={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        task={editingTask}
      />

      <BlockTaskDialog
        open={Boolean(blockingTask)}
        task={blockingTask}
        onClose={() => setBlockingTask(null)}
        onConfirm={handleBlockConfirm}
      />
    </Box>
  );
};

export default TodayPage;
