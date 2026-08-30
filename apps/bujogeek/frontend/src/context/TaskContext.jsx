import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApolloClient } from '@apollo/client';
import { Alert, Snackbar } from '@mui/material';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  GET_TASKS, GET_ALL_TASKS, GET_DAILY_TASKS, GET_WEEKLY_TASKS, GET_MONTHLY_TASKS
} from '../graphql/queries';
import {
  CREATE_TASK, UPDATE_TASK, DELETE_TASK, UPDATE_TASK_STATUS, MIGRATE_TASK_TO_FUTURE, SAVE_DAILY_TASK_ORDER
} from '../graphql/mutations';
import RecurringEditDialog from '../components/tasks/RecurringEditDialog';
// Pure sort module — keeps the comparator testable without this file's deps.
import { compareTasks, sortTasks } from '../utils/taskSort.js';


const AUTH_CONFIG = { withCredentials: true };

// Error types for better error handling
const TaskError = {
  NETWORK: 'NETWORK_ERROR',
  AUTH: 'AUTH_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  SERVER: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

// Loading states for different operations
export const LoadingState = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  CREATING: 'creating',
  UPDATING: 'updating',
  DELETING: 'deleting',
  MIGRATING: 'migrating',
  ERROR: 'error'
};

// compareTasks/sortTasks now live in utils/taskSort.js (imported above).
// Re-export for existing importers that pull compareTasks from this context.
export { compareTasks };

const sameTask = (task, taskId) => String(task?.id ?? task?._id) === String(taskId);

/** Find a task in either state shape (flat array, or object keyed by date). */
const findTaskInState = (state, taskId) => {
  if (Array.isArray(state)) return state.find(t => sameTask(t, taskId)) || null;
  if (!state || typeof state !== 'object') return null;

  for (const list of Object.values(state)) {
    if (!Array.isArray(list)) continue;
    const found = list.find(t => sameTask(t, taskId));
    if (found) return found;
  }
  return null;
};

/**
 * Apply `mapper` to every task, re-sorting each list. Handles both shapes this
 * context stores tasks in: a flat array (daily/weekly) and an object keyed by
 * date (all/monthly).
 */
const mapTasksState = (state, mapper) => {
  if (Array.isArray(state)) return sortTasks(state.map(mapper));
  if (!state || typeof state !== 'object') return state;

  const next = {};
  Object.entries(state).forEach(([date, list]) => {
    next[date] = Array.isArray(list) ? sortTasks(list.map(mapper)) : list;
  });
  return next;
};

const TaskContext = createContext();

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

const TaskProvider = ({ children }) => {
  const apolloClient = useApolloClient();

  // Main state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(LoadingState.IDLE);
  const [error, setError] = useState(null);
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);
  const [currentView, setCurrentView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Recurring dialog state
  const [recurringDialog, setRecurringDialog] = useState({ open: false, actionType: 'delete', resolve: null });

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    signifier: '',
    tags: []
  });

  // Mirror of `tasks` for callbacks that must read the latest state without
  // taking a dependency on it (keeps their identity stable across re-renders).
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const getTaskFromState = useCallback((id) => findTaskInState(tasksRef.current, id), []);

  const promptRecurringScope = async (actionType) => {
    return new Promise((resolve) => {
      setRecurringDialog({ open: true, actionType, resolve });
    });
  };

  const handleRecurringDialogClose = () => {
    if (recurringDialog.resolve) recurringDialog.resolve(null);
    setRecurringDialog(prev => ({ ...prev, open: false }));
  };

  const handleRecurringDialogConfirm = (scope) => {
    if (recurringDialog.resolve) recurringDialog.resolve(scope);
    setRecurringDialog(prev => ({ ...prev, open: false }));
  };

  const clearError = useCallback(() => setError(null), []);

  /**
   * Every request in this app goes through Apollo, so errors arrive as
   * ApolloError: { graphQLErrors: [...], networkError, message } — never as the
   * axios `error.response.status` shape this used to parse.
   *
   * Records a `{ type, message }` on context state (which renders a snackbar)
   * and returns the message. It intentionally does NOT rethrow; callers that
   * need the rejection to propagate (createTask/updateTask, whose dialogs stay
   * open on failure) rethrow explicitly.
   */
  const handleApiError = useCallback((err, fallback = 'An unexpected error occurred') => {
    const gqlErrors = err?.graphQLErrors ?? [];
    const networkError = err?.networkError;
    const networkGqlErrors = networkError?.result?.errors ?? [];

    let type = TaskError.UNKNOWN;
    let message = '';

    if (gqlErrors.length > 0) {
      message = gqlErrors.map((e) => e.message).filter(Boolean).join('; ');
      const code = gqlErrors[0]?.extensions?.code;
      if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
        type = TaskError.AUTH;
      } else if (code === 'BAD_USER_INPUT' || code === 'GRAPHQL_VALIDATION_FAILED') {
        type = TaskError.VALIDATION;
      } else {
        type = TaskError.SERVER;
      }
    } else if (networkError) {
      message = networkGqlErrors.map((e) => e.message).filter(Boolean).join('; ');
      if (networkError.statusCode === 401 || networkError.statusCode === 403) {
        type = TaskError.AUTH;
        message = message || 'Your session has expired. Please sign in again.';
      } else {
        type = TaskError.NETWORK;
        message = message || networkError.message || 'Network error — could not reach the server';
      }
    } else if (err?.message) {
      message = err.message;
    }

    const finalMessage = message || fallback;
    setError({ type, message: finalMessage });
    return finalMessage;
  }, []);

  // Filter management
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      search: '',
      status: '',
      priority: '',
      signifier: '',
      tags: []
    });
  }, []);

  // Task fetching with debouncing and cache
  // NOTE: Backend does not implement /tasks/range; use /tasks with startDate/endDate query params.
  const fetchTasksForDateRange = useCallback(async (startDate, endDate, fetchKey) => {
    // Generate fetch key if not provided
    const key = fetchKey || `${ startDate.toISOString() }-${ endDate.toISOString() }`;

    // Skip if already fetching this range
    if (loading === LoadingState.FETCHING && lastFetchRef.current === key) {
      return;
    }

    try {
      setLoading(LoadingState.FETCHING);
      setError(null);
      lastFetchRef.current = key;

      // Format dates as YYYY-MM-DD
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');

      const response = await apolloClient.query({
        query: GET_MONTHLY_TASKS, // Reuse monthly for arbitrary range conceptually
        variables: { startDate: formattedStartDate, endDate: formattedEndDate },
        fetchPolicy: 'no-cache'
      });

      const newTasks = response.data?.monthlyTasks || [];
      setTasks(prevTasks => {
        if (JSON.stringify(prevTasks) !== JSON.stringify(newTasks)) {
          return newTasks;
        }
        return prevTasks;
      });

      setLoading(LoadingState.IDLE);
      setError(null);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      handleApiError(error, 'Failed to load tasks');
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError, loading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  // Task fetching
  const fetchTasks = useCallback(async (viewType, date) => {
    setLoading(LoadingState.FETCHING);
    setError(null);
    try {
      let responseData = [];

      switch (viewType) {
        case 'daily':
          const dateStr = format(date || new Date(), 'yyyy-MM-dd');
          const dRes = await apolloClient.query({
            query: GET_DAILY_TASKS,
            variables: { date: dateStr },
            fetchPolicy: 'no-cache'
          });
          responseData = dRes.data?.dailyTasks || [];
          break;
        case 'weekly':
          const startDate = startOfWeek(date || new Date());
          const wRes = await apolloClient.query({
            query: GET_WEEKLY_TASKS,
            variables: { date: format(startDate, 'yyyy-MM-dd') },
            fetchPolicy: 'no-cache'
          });
          responseData = wRes.data?.weeklyTasks || [];
          break;
        case 'monthly':
          const monthStart = startOfMonth(date || new Date());
          const monthEnd = endOfMonth(date || new Date());
          const mRes = await apolloClient.query({
            query: GET_MONTHLY_TASKS,
            variables: {
              startDate: format(monthStart, 'yyyy-MM-dd'),
              endDate: format(monthEnd, 'yyyy-MM-dd')
            },
            fetchPolicy: 'no-cache'
          });
          responseData = mRes.data?.monthlyTasks || [];
          break;
        case 'year':
        default:
          const aRes = await apolloClient.query({
            query: GET_ALL_TASKS,
            fetchPolicy: 'no-cache'
          });
          responseData = aRes.data?.allTasks || [];
          break;
      }

      setTasks(responseData);
      setCurrentView(viewType);
      setCurrentDate(date || new Date());
      setLoading(LoadingState.IDLE);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      handleApiError(err, 'Failed to fetch tasks');
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError]);

  const fetchAllTasks = useCallback(async () => {
    // Skip if already fetching
    if (loading === LoadingState.FETCHING) {
      return;
    }

    // Generate a unique request ID
    const requestId = Date.now();
    lastFetchRef.current = requestId;

    try {
      setLoading(LoadingState.FETCHING);
      setError(null);

      const response = await apolloClient.query({
        query: GET_ALL_TASKS,
        fetchPolicy: 'no-cache'
      });

      // Check if this is still the most recent request
      if (lastFetchRef.current !== requestId) {
        return;
      }

      const newTasks = response.data?.allTasks || [];

      // Only update state if the data has actually changed
      setTasks(prevTasks => {
        const prevString = JSON.stringify(prevTasks);
        const newString = JSON.stringify(newTasks);
        if (prevString !== newString) {
          return newTasks;
        }
        return prevTasks;
      });

      setLoading(LoadingState.IDLE);
      setError(null);
    } catch (error) {
      // Only set error if this is still the most recent request
      if (lastFetchRef.current === requestId) {
        console.error('Error fetching all tasks:', error);
        handleApiError(error, 'Failed to load tasks');
        setLoading(LoadingState.IDLE);
      }
    }
  }, [handleApiError]);

  // Remove the effect that watches filters for 'all' view
  // Instead, add a debounced filter effect
  const debouncedFetchRef = useRef(null);

  useEffect(() => {
    // Only run this effect if we're in the 'all' view
    const path = window.location.pathname;
    const view = path.split('/')[2] || 'daily';

    if (view === 'all' && loading === LoadingState.IDLE) {
      // Clear any existing timeout
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }

      // Set a new timeout
      debouncedFetchRef.current = setTimeout(() => {
        fetchAllTasks();
      }, 300); // Debounce for 300ms
    }

    // Cleanup
    return () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
    };
  }, [filters, fetchAllTasks]); // Remove loading from dependencies

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
    };
  }, []);

  // Task operations
  const createTask = useCallback(async (taskData) => {
    setLoading(LoadingState.CREATING);
    setError(null);
    try {
      const response = await apolloClient.mutate({
        mutation: CREATE_TASK,
        variables: { ...taskData }
      });

      const createdTask = response.data?.createTask;

      setTasks(prevTasks => (
        Array.isArray(prevTasks) ? [...prevTasks, createdTask] : [createdTask]
      ));
      return createdTask;
    } catch (err) {
      handleApiError(err, 'Failed to create task');
      throw err;
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError]);

  const updateTask = useCallback(async (taskId, updates, editScope = 'THIS_INSTANCE') => {
    try {
      setLoading(LoadingState.UPDATING);
      setError(null);

      const ALLOWED_UPDATE_FIELDS = [
        'content', 'signifier', 'status', 'priority', 'note',
        'tags', 'dueDate', 'isBacklog', 'recurrenceRule',
        // null files the task out of its collection; a string moves it.
        'collectionId',
      ];
      const cleanUpdates = {};
      for (const key of ALLOWED_UPDATE_FIELDS) {
        if (key in updates) {
          cleanUpdates[key] = updates[key];
        }
      }

      const response = await apolloClient.mutate({
        mutation: UPDATE_TASK,
        variables: { id: taskId, input: cleanUpdates, editScope }
      });

      const updatedTask = response.data?.updateTask;

      setTasks(prevTasks => {
        // Handle array format (daily view)
        if (Array.isArray(prevTasks)) {
          return sortTasks(
            prevTasks.map(task => (task.id || task._id) === taskId ? updatedTask : task)
          );
        }

        // Handle object format (all/other views)
        const oldDateKey = Object.keys(prevTasks).find(date =>
          prevTasks[date].some(task => (task.id || task._id) === taskId)
        );

        const newDateKey = updatedTask.dueDate ?
          (() => {
            const d = new Date(updatedTask.dueDate);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${ y }-${ m }-${ day }`;
          })() :
          'no-date';

        const newTasks = { ...prevTasks };

        // Remove from old date if it exists
        if (oldDateKey) {
          newTasks[oldDateKey] = sortTasks(
            newTasks[oldDateKey].filter(task => (task.id || task._id) !== taskId)
          );

          // Clean up empty dates
          if (newTasks[oldDateKey].length === 0) {
            delete newTasks[oldDateKey];
          }
        }

        // Add to new date
        newTasks[newDateKey] = sortTasks([
          ...(newTasks[newDateKey] || []),
          updatedTask
        ]);

        return newTasks;
      });

      setLoading(LoadingState.IDLE);
      return updatedTask;
    } catch (err) {
      handleApiError(err, 'Failed to update task');
      setLoading(LoadingState.IDLE);
      throw err;
    }
  }, [handleApiError]);

  /**
   * Optimistic status toggle: flip the task in local state immediately so the
   * checkbox responds instantly, then reconcile with the server response.
   * On failure the previous task object is restored and the error surfaced.
   */
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    const snapshot = findTaskInState(tasksRef.current, taskId);
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
    const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;

    setError(null);
    setTasks(prev => mapTasksState(prev, task => (
      sameTask(task, taskId) ? { ...task, status: newStatus, completedAt, cancelledAt } : task
    )));

    try {
      const response = await apolloClient.mutate({
        mutation: UPDATE_TASK_STATUS,
        variables: { id: taskId, status: newStatus }
      });

      const serverTask = response.data?.updateTaskStatus;
      if (serverTask) {
        // Reconcile with the authoritative server object.
        setTasks(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...serverTask } : task
        )));
      }

      setError(null);
      return serverTask;
    } catch (error) {
      // Roll back to the pre-toggle task object.
      if (snapshot) {
        setTasks(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? snapshot : task
        )));
      }
      handleApiError(error, 'Failed to update task status');
      return undefined;
    }
  }, [apolloClient, handleApiError]);

  const deleteTask = useCallback(async (taskId, editScopeParam = null) => {
    try {
      const task = getTaskFromState(taskId);
      let editScope = editScopeParam;
      if (!editScope) {
        if (task && (task.isSeriesMaster || task.seriesId || task.recurrenceRule || String(taskId).startsWith('virtual_'))) {
          editScope = await promptRecurringScope('delete');
          if (!editScope) return; // user cancelled
        } else {
          editScope = 'THIS_INSTANCE';
        }
      }

      setLoading(LoadingState.DELETING);
      setError(null);
      await apolloClient.mutate({
        mutation: DELETE_TASK,
        variables: { id: taskId, editScope }
      });

      setTasks(prev => {
        // If prev is an array (daily view)
        if (Array.isArray(prev)) {
          return prev.filter(task => (task.id || task._id) !== taskId);
        }

        // If prev is an object (grouped by dates)
        const newTasks = {};
        Object.entries(prev).forEach(([date, dateTasks]) => {
          if (!Array.isArray(dateTasks)) return;
          const filteredTasks = dateTasks.filter(task => (task.id || task._id) !== taskId);
          if (filteredTasks.length > 0) {
            newTasks[date] = filteredTasks;
          }
        });
        return newTasks;
      });
    } catch (error) {
      handleApiError(error, 'Failed to delete task');
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError, getTaskFromState]);

  // Migration operations
  const migrateTask = useCallback(async (taskId, targetDate) => {
    try {
      setLoading(LoadingState.MIGRATING);
      setError(null);

      const response = await apolloClient.mutate({
        mutation: MIGRATE_TASK_TO_FUTURE,
        variables: { id: taskId, futureDate: format(targetDate, 'yyyy-MM-dd') }
      });

      const migratedTask = response.data?.migrateTaskToFuture;

      setTasks(prev => {
        const newTasks = {};
        Object.entries(prev).forEach(([date, tasks]) => {
          const filteredTasks = tasks.filter(task => (task.id || task._id) !== taskId);
          if (filteredTasks.length > 0) {
            newTasks[date] = filteredTasks;
          }
        });

        const newDate = format(new Date(targetDate), 'yyyy-MM-dd');
        if (!newTasks[newDate]) {
          newTasks[newDate] = [];
        }
        newTasks[newDate].push(migratedTask);

        return newTasks;
      });

      return migratedTask;
    } catch (error) {
      handleApiError(error, 'Failed to migrate task');
    } finally {
      setLoading(LoadingState.IDLE);
    }
  }, [handleApiError]);

  const saveDailyOrder = useCallback(async (dateKey, orderedTaskIds) => {
    try {
      await apolloClient.mutate({
        mutation: SAVE_DAILY_TASK_ORDER,
        variables: { dateKey, orderedTaskIds }
      });
    } catch (error) {
      handleApiError(error, 'Failed to save task order');
    }
  }, [apolloClient, handleApiError]);

  const value = useMemo(() => ({
    // State
    tasks,
    loading,
    error,
    filters,
    currentView,
    currentDate,

    // Error handling
    clearError,

    // Filter management
    updateFilters,
    clearFilters,

    // Task operations
    fetchTasks,
    fetchAllTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    migrateTask,
    saveDailyOrder,

    // Constants
    TaskError,
    LoadingState
  }), [
    tasks,
    loading,
    error,
    filters,
    currentView,
    currentDate,
    updateFilters,
    clearFilters,
    fetchTasks,
    fetchAllTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    migrateTask,
    saveDailyOrder,
    clearError
  ]);

  return (
    <TaskContext.Provider value={value}>
      {children}
      <RecurringEditDialog
        open={recurringDialog.open}
        actionType={recurringDialog.actionType}
        onClose={handleRecurringDialogClose}
        onConfirm={handleRecurringDialogConfirm}
      />
      {/* App-wide surface for task errors. Cleared on dismiss, and on the next
          successful operation (each operation resets `error` to null). */}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={6000}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          clearError();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 80, md: 24 } }}
      >
        <Alert
          onClose={clearError}
          severity="error"
          variant="filled"
          sx={{ maxWidth: 480 }}
        >
          {typeof error === 'string' ? error : error?.message}
        </Alert>
      </Snackbar>
    </TaskContext.Provider>
  );
};

export { TaskProvider };