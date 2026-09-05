import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApolloClient } from '@apollo/client';
import { Alert, Snackbar } from '@mui/material';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  GET_TASKS, GET_ALL_TASKS, GET_DAILY_TASKS, GET_WEEKLY_TASKS, GET_MONTHLY_TASKS
} from '../graphql/queries';
import {
  CREATE_TASK, UPDATE_TASK, DELETE_TASK, UPDATE_TASK_STATUS, MIGRATE_TASK_TO_FUTURE, SAVE_DAILY_TASK_ORDER,
  BLOCK_TASK, UNBLOCK_TASK, ADD_SUBTASK, REORDER_SUBTASKS
} from '../graphql/mutations';
// The cache rule these `update` functions implement is written down at the
// client setup — see `apolloClient.js`. In short: this context owns the log
// views' React state, and the update functions own everything the Apollo
// cache holds (collections, their counts, the tag index, subtask membership).
import {
  onTaskCreated, onTaskUpdated, onTaskStatusChanged, onTaskDeleted,
  onSubtaskAdded, onSubtaskRemoved,
} from '../graphql/cacheUpdates';
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

/** The task itself, or whichever of its steps carries `taskId`. */
const findInTask = (task, taskId) => {
  if (sameTask(task, taskId)) return task;
  const children = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return children.find(child => sameTask(child, taskId)) || null;
};

/**
 * Find a task in either state shape (flat array, or object keyed by date),
 * searching one level of subtasks as well — a step is togglable, editable and
 * deletable from its parent's expanded row, so every lookup here has to be
 * able to reach it.
 */
const findTaskInState = (state, taskId) => {
  const search = (list) => {
    for (const task of list) {
      const found = findInTask(task, taskId);
      if (found) return found;
    }
    return null;
  };

  if (Array.isArray(state)) return search(state);
  if (!state || typeof state !== 'object') return null;

  for (const list of Object.values(state)) {
    if (!Array.isArray(list)) continue;
    const found = search(list);
    if (found) return found;
  }
  return null;
};

/** The task that owns `taskId` as one of its steps, if any. */
const findParentInState = (state, taskId) => {
  const search = (list) => list.find(task => (
    !sameTask(task, taskId) &&
    (Array.isArray(task?.subtasks) ? task.subtasks : []).some(child => sameTask(child, taskId))
  )) || null;

  if (Array.isArray(state)) return search(state);
  if (!state || typeof state !== 'object') return null;
  for (const list of Object.values(state)) {
    if (!Array.isArray(list)) continue;
    const found = search(list);
    if (found) return found;
  }
  return null;
};

/**
 * Apply `mapper` to a task AND to each of its steps.
 *
 * A step is an ordinary task that happens to live inside its parent's
 * `subtasks` array, so every operation that can hit a top-level row can hit a
 * step too — and the parent's `2/5` chip is read straight off that array, so
 * patching the child in place is what moves the chip. The parent object is
 * only cloned when a child actually changed, which keeps React's identity
 * checks meaningful for the overwhelming majority of rows.
 *
 * Steps are NOT re-sorted: their order is the writer's, stored on the parent.
 */
const mapTaskDeep = (mapper) => (task) => {
  const mapped = mapper(task);
  const children = Array.isArray(mapped?.subtasks) ? mapped.subtasks : null;
  if (!children || children.length === 0) return mapped;

  const nextChildren = children.map(mapper);
  const changed = nextChildren.some((child, i) => child !== children[i]);
  return changed ? { ...mapped, subtasks: nextChildren } : mapped;
};

/**
 * Apply `mapper` to every task, re-sorting each list. Handles both shapes this
 * context stores tasks in: a flat array (daily/weekly) and an object keyed by
 * date (all/monthly).
 */
const mapTasksState = (state, mapper) => {
  const deep = mapTaskDeep(mapper);
  if (Array.isArray(state)) return sortTasks(state.map(deep));
  if (!state || typeof state !== 'object') return state;

  const next = {};
  Object.entries(state).forEach(([date, list]) => {
    next[date] = Array.isArray(list) ? sortTasks(list.map(deep)) : list;
  });
  return next;
};

/**
 * Drop `taskId` from every list AND from every parent's `subtasks` array —
 * deleting a step has to move the chip it was being counted in.
 */
const removeTaskFromState = (state, taskId) => {
  const prune = (list) => list
    .filter(task => !sameTask(task, taskId))
    .map((task) => {
      const children = Array.isArray(task?.subtasks) ? task.subtasks : null;
      if (!children || !children.some(child => sameTask(child, taskId))) return task;
      return { ...task, subtasks: children.filter(child => !sameTask(child, taskId)) };
    });

  if (Array.isArray(state)) return prune(state);
  if (!state || typeof state !== 'object') return state;

  const next = {};
  Object.entries(state).forEach(([date, list]) => {
    if (!Array.isArray(list)) return;
    const pruned = prune(list);
    if (pruned.length > 0) next[date] = pruned;
  });
  return next;
};

/**
 * A complete `updateTaskStatus` payload built from what the client already
 * knows, so the optimistic layer satisfies the mutation's whole selection set
 * (`mutations.js` → UPDATE_TASK_STATUS + TaskFamily). Every field is spelled
 * out: a missing one is a console warning on every single checkbox tick.
 *
 * Returns undefined — Apollo's "no optimistic layer" — for a task we have no
 * snapshot of, and for a `virtual_` recurring occurrence, whose id is
 * synthetic. Optimistically writing `Task:virtual_…` would put an entity in
 * the cache that the server will answer under a different id.
 */
const buildOptimisticStatus = (snapshot, taskId, status, completedAt, cancelledAt) => {
  if (!snapshot || String(taskId).startsWith('virtual_')) return undefined;

  const child = (c) => ({
    __typename: 'Task',
    id: String(c?.id ?? c?._id ?? ''),
    content: c?.content ?? '',
    signifier: c?.signifier ?? null,
    status: c?.status ?? 'pending',
    priority: c?.priority ?? null,
    note: c?.note ?? null,
    tags: c?.tags ?? [],
    dueDate: c?.dueDate ?? null,
    originalDate: c?.originalDate ?? null,
    taskType: c?.taskType ?? null,
    completedAt: c?.completedAt ?? null,
    cancelledAt: c?.cancelledAt ?? null,
    createdAt: c?.createdAt ?? null,
    updatedAt: c?.updatedAt ?? null,
  });

  return {
    updateTaskStatus: {
      __typename: 'Task',
      id: String(taskId),
      content: snapshot.content ?? '',
      signifier: snapshot.signifier ?? null,
      status,
      completedAt,
      cancelledAt,
      priority: snapshot.priority ?? null,
      note: snapshot.note ?? null,
      tags: snapshot.tags ?? [],
      dueDate: snapshot.dueDate ?? null,
      originalDate: snapshot.originalDate ?? null,
      migratedFrom: snapshot.migratedFrom ?? null,
      migratedTo: snapshot.migratedTo ?? null,
      isBacklog: snapshot.isBacklog ?? false,
      // Every non-blocked status clears the parked fields server-side.
      blockedReason: null,
      blockedAt: null,
      taskType: snapshot.taskType ?? null,
      createdAt: snapshot.createdAt ?? null,
      updatedAt: new Date().toISOString(),
      parentTask: snapshot.parentTask
        ? {
            __typename: 'Task',
            id: String(snapshot.parentTask.id ?? snapshot.parentTask._id ?? ''),
            content: snapshot.parentTask.content ?? '',
            status: snapshot.parentTask.status ?? 'pending',
          }
        : null,
      subtasks: (Array.isArray(snapshot.subtasks) ? snapshot.subtasks : []).map(child),
    },
  };
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
        case 'daily': {
          const dateStr = format(date || new Date(), 'yyyy-MM-dd');
          const dRes = await apolloClient.query({
            query: GET_DAILY_TASKS,
            variables: { date: dateStr },
            fetchPolicy: 'no-cache'
          });
          responseData = dRes.data?.dailyTasks || [];
          break;
        }
        case 'weekly': {
          const startDate = startOfWeek(date || new Date());
          const wRes = await apolloClient.query({
            query: GET_WEEKLY_TASKS,
            variables: { date: format(startDate, 'yyyy-MM-dd') },
            fetchPolicy: 'no-cache'
          });
          responseData = wRes.data?.weeklyTasks || [];
          break;
        }
        case 'monthly': {
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
        }
        case 'year':
        default: {
          const aRes = await apolloClient.query({
            query: GET_ALL_TASKS,
            fetchPolicy: 'no-cache'
          });
          responseData = aRes.data?.allTasks || [];
          break;
        }
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
        variables: { ...taskData },
        // Clause 3: a new task changes the tag index and, if it is filed, its
        // collection's tallies. Both are the gateway's to compute.
        update: onTaskCreated,
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

      // The result knows where the task landed; only the client knows where it
      // came from, so the previous collection is closed over for the update.
      const previousCollectionId = findTaskInState(tasksRef.current, taskId)?.collectionId ?? null;

      const response = await apolloClient.mutate({
        mutation: UPDATE_TASK,
        variables: { id: taskId, input: cleanUpdates, editScope },
        update: onTaskUpdated(previousCollectionId),
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
        variables: { id: taskId, status: newStatus },
        // Ticking a checkbox is this app's most-repeated gesture; it must not
        // wait on a round trip. Apollo writes this layer immediately and rolls
        // the whole thing back if the mutation rejects.
        optimisticResponse: buildOptimisticStatus(snapshot, taskId, newStatus, completedAt, cancelledAt),
        update: onTaskStatusChanged(snapshot?.collectionId ?? null),
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

  /**
   * Park a task ("blocked"): it keeps its due date but leaves the log until it
   * is unblocked. Not optimistic — `blockedAt` is the server's clock and the
   * gateway refuses to block a completed/cancelled task, so we wait for the
   * authoritative object and merge it in (the same reconcile step
   * `updateTaskStatus` does after its optimistic flip).
   *
   * Every list that can contain a parked task is fetched `no-cache`, so the
   * views that need to change refetch after this resolves rather than relying
   * on Apollo cache invalidation (see the CONTEXT.md debt note).
   *
   * @param {string} taskId
   * @param {string} [reason] optional; 280 chars max, enforced by the gateway
   * @returns {Promise<object|undefined>} the parked task, or undefined on error
   */
  const blockTask = useCallback(async (taskId, reason) => {
    setError(null);
    try {
      const response = await apolloClient.mutate({
        mutation: BLOCK_TASK,
        variables: { id: taskId, reason: reason?.trim() ? reason.trim() : null },
        update: onTaskStatusChanged(findTaskInState(tasksRef.current, taskId)?.collectionId ?? null),
      });

      const serverTask = response.data?.blockTask;
      if (serverTask) {
        setTasks(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...serverTask } : task
        )));
      }
      return serverTask;
    } catch (error) {
      handleApiError(error, 'Failed to block task');
      return undefined;
    }
  }, [apolloClient, handleApiError]);

  /** Un-park a task: back to `pending`, blocked fields cleared, dueDate kept. */
  const unblockTask = useCallback(async (taskId) => {
    setError(null);
    try {
      const response = await apolloClient.mutate({
        mutation: UNBLOCK_TASK,
        variables: { id: taskId },
        update: onTaskStatusChanged(findTaskInState(tasksRef.current, taskId)?.collectionId ?? null),
      });

      const serverTask = response.data?.unblockTask;
      if (serverTask) {
        setTasks(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...serverTask } : task
        )));
      }
      return serverTask;
    } catch (error) {
      handleApiError(error, 'Failed to unblock task');
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

      // A step is deleted like any other task; the difference is that its
      // parent's list has to lose it too, on both sides — the Apollo cache
      // (the `2/5` chip in a collection view) and this context's array.
      const parent = findParentInState(tasksRef.current, taskId);

      await apolloClient.mutate({
        mutation: DELETE_TASK,
        variables: { id: taskId, editScope },
        // `deleteTask` returns only `{ success }`, so the id and the
        // collection are closed over here — clause 2 of the cache rule.
        update: parent
          ? onSubtaskRemoved(parent.id || parent._id, taskId)
          : onTaskDeleted(taskId, task?.collectionId ?? null),
      });

      setTasks(prev => removeTaskFromState(prev, taskId));
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
        variables: { id: taskId, futureDate: format(targetDate, 'yyyy-MM-dd') },
        update: onTaskUpdated(null),
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

  /**
   * Add a step to an entry.
   *
   * The gateway creates an ordinary task carrying `parentTask` and appends it
   * to the parent's ordered list; here that means appending it to the parent's
   * `subtasks` array in state, which is what the `2/5` chip counts. The step
   * is deliberately NOT added as a top-level row: it belongs under its parent
   * for as long as the parent is on screen (`utils/subtasks.splitNested`).
   *
   * @returns {Promise<object|undefined>} the new step, or undefined on error
   */
  const addSubtask = useCallback(async (parentId, input) => {
    setError(null);
    try {
      const response = await apolloClient.mutate({
        mutation: ADD_SUBTASK,
        variables: {
          parentId,
          content: input?.content ?? '',
          signifier: input?.signifier ?? '*',
          priority: input?.priority ?? null,
          tags: input?.tags ?? [],
          dueDate: input?.dueDate ?? null,
        },
        update: onSubtaskAdded(parentId),
      });

      const subtask = response.data?.addSubtask;
      if (!subtask) return undefined;

      setTasks(prev => mapTasksState(prev, task => {
        if (!sameTask(task, parentId)) return task;
        const children = Array.isArray(task.subtasks) ? task.subtasks : [];
        if (children.some(child => sameTask(child, subtask.id))) return task;
        return { ...task, subtasks: [...children, subtask] };
      }));

      return subtask;
    } catch (error) {
      handleApiError(error, 'Failed to add subtask');
      return undefined;
    }
  }, [apolloClient, handleApiError]);

  /**
   * Reorder an entry's steps. `orderedSubtaskIds` must name every one of them
   * exactly once — the gateway rejects a partial list rather than dropping the
   * remainder, which is the behaviour we want: a reorder that quietly loses a
   * row is worse than one that fails.
   *
   * Optimistic, because dragging a row and watching it snap back for a beat is
   * the whole reason reorder UIs feel cheap. The pre-move order is restored on
   * failure.
   */
  const reorderSubtasks = useCallback(async (parentId, orderedSubtaskIds) => {
    setError(null);
    const snapshot = findTaskInState(tasksRef.current, parentId);
    const previous = Array.isArray(snapshot?.subtasks) ? snapshot.subtasks : [];

    const byId = new Map(previous.map(child => [String(child.id ?? child._id), child]));
    const reordered = orderedSubtaskIds.map(id => byId.get(String(id))).filter(Boolean);
    if (reordered.length === previous.length) {
      setTasks(prev => mapTasksState(prev, task => (
        sameTask(task, parentId) ? { ...task, subtasks: reordered } : task
      )));
    }

    try {
      const response = await apolloClient.mutate({
        mutation: REORDER_SUBTASKS,
        variables: { parentId, orderedSubtaskIds },
      });
      return response.data?.reorderSubtasks;
    } catch (error) {
      setTasks(prev => mapTasksState(prev, task => (
        sameTask(task, parentId) ? { ...task, subtasks: previous } : task
      )));
      handleApiError(error, 'Failed to reorder subtasks');
      return undefined;
    }
  }, [apolloClient, handleApiError]);

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
    blockTask,
    unblockTask,
    deleteTask,
    migrateTask,
    saveDailyOrder,

    // Subtasks (removal is deleteTask — a step is an ordinary task)
    addSubtask,
    reorderSubtasks,
    getTaskFromState,

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
    blockTask,
    unblockTask,
    deleteTask,
    migrateTask,
    saveDailyOrder,
    addSubtask,
    reorderSubtasks,
    getTaskFromState,
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