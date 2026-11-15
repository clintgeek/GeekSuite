import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { useApolloClient } from '@apollo/client';
import { format, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { localTimeZone } from '@geeksuite/task-grammar';
import {
  GET_ALL_TASKS, GET_DAILY_TASKS, GET_WEEKLY_TASKS, GET_MONTHLY_TASKS
} from '../graphql/queries';
import {
  CREATE_TASK, UPDATE_TASK, DELETE_TASK, UPDATE_TASK_STATUS, MIGRATE_TASK_TO_FUTURE,
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
import { avoidUtcMidnight, dueFields, withExplicitTime } from '../utils/dueDate';
import { newClientId } from '../utils/clientId.js';
// Pure sort module — keeps the comparator testable without this file's deps.
import { compareTasks, sortTasks } from '../utils/taskSort.js';


/**
 * How long a write may take before it is given up (plan 1.10). The request is
 * aborted and the caller told; a create is retried with the SAME clientId
 * (contract C1), so a write that did land is never made twice. Reads are not
 * limited: `allTasks` on a slow phone connection may honestly take longer.
 */
export const WRITE_TIMEOUT_MS = 15000;
const WRITE_CONTEXT = { timeoutMs: WRITE_TIMEOUT_MS };

/** How many times a read that overlapped a local write is re-run (plan 1.9). */
export const MAX_FETCH_ATTEMPTS = 4;

/** A client id for one create (contract C1), reused on its retries. */
export { newClientId };

/** Every task entering state, with a timed 6 pm-Central instant off UTC midnight. */
const ingest = (list) => (Array.isArray(list) ? list.map(withExplicitTime) : list);

/**
 * The write's due-date fields with their flag (contract C2). A caller that
 * already says `hasDueTime` is believed (a timed value is still moved off
 * UTC midnight); one that does not gets it from the value's shape.
 */
function withDueFlag(fields) {
  if (!fields || !('dueDate' in fields)) return fields;
  if (typeof fields.hasDueTime === 'boolean') {
    return fields.hasDueTime && fields.dueDate
      ? { ...fields, dueDate: avoidUtcMidnight(fields.dueDate).toISOString?.() ?? fields.dueDate }
      : fields;
  }
  return { ...fields, ...dueFields(fields.dueDate) };
}

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
  // Map first, and only pay for a re-sort (and a new array identity) when
  // something actually changed. A mutation touches one task; every list it
  // did not touch keeps its reference, and in the list it did touch every
  // other task keeps its object identity — which is what lets a memoised
  // TaskRow skip re-rendering (TODOGEEK_REVIEW §3.3).
  const mapList = (list) => {
    const mapped = list.map(deep);
    return mapped.some((task, i) => task !== list[i]) ? sortTasks(mapped) : list;
  };
  if (Array.isArray(state)) return mapList(state);
  if (!state || typeof state !== 'object') return state;

  const next = {};
  Object.entries(state).forEach(([date, list]) => {
    next[date] = Array.isArray(list) ? mapList(list) : list;
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
      hasDueTime: typeof snapshot.hasDueTime === 'boolean' ? snapshot.hasDueTime : null,
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

/**
 * The caller's UTC offset FOR A GIVEN DATE, in JavaScript's own sign
 * convention (minutes west of UTC: US-Central summer is 300).
 *
 * Per-date on purpose. `new Date().getTimezoneOffset()` is the offset for
 * NOW, which is the wrong answer when the page is showing a day on the other
 * side of a DST boundary — and it is the browser, not the gateway, that knows
 * this zone's rules.
 *
 * The gateway needs it because `dueDate` carries two kinds of value: UTC
 * midnight means a date, anything else is a real instant, and an evening
 * instant belongs to a different UTC day than the one the user is looking at.
 */
const tzOffsetFor = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime())
    ? new Date().getTimezoneOffset()
    : d.getTimezoneOffset();
};

const TaskContext = createContext();

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

/**
 * The task list behind every TodoGeek view, and every write to it.
 *
 * ## Reads never overwrite newer writes (plan 1.9)
 * A read that started before (or ran during) a local write may answer with
 * the list as it was BEFORE that write: open the app after a minute away,
 * type at once, and the big `allTasks` reply lands after the create — the new
 * task vanished until the next refresh. Every write bumps `writeSeq`; a read
 * whose window overlapped one is dropped and run again (up to
 * MAX_FETCH_ATTEMPTS), and a read that a newer read has superseded is dropped.
 *
 * ## An empty answer is double-checked (plan 1.12)
 * A non-empty list is never replaced by an empty one on a single answer: the
 * read is repeated once first. Failures are returned (`{ status: 'error' }`)
 * so the caller can say "Couldn't reach your list" instead of "Nothing due".
 *
 * ## Errors
 * `error` is set for the caller to show; this provider renders nothing of its
 * own (it sits outside the toast provider — PenContext turns `error` into a
 * toast). The retired screens' snackbar and recurring-scope dialog are gone.
 */
const TaskProvider = ({ children }) => {
  const apolloClient = useApolloClient();

  // Main state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(LoadingState.IDLE);
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Mirror of `tasks` for callbacks that must read the latest state without
  // taking a dependency on it (keeps their identity stable across re-renders).
  // Updated synchronously by `commit`, not by an effect, so a read that lands
  // in the same tick as a write sees it.
  const tasksRef = useRef(tasks);
  const commit = useCallback((updater) => {
    setTasks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      tasksRef.current = next;
      return next;
    });
  }, []);

  const getTaskFromState = useCallback((id) => findTaskInState(tasksRef.current, id), []);

  /* ---------- write sequencing (1.9) ---------- */

  const writeSeq = useRef(0);
  const writesInFlight = useRef(0);
  const writeWaiters = useRef([]);
  const fetchSeq = useRef(0);

  const beginWrite = useCallback(() => {
    writeSeq.current += 1;
    writesInFlight.current += 1;
  }, []);
  const endWrite = useCallback(() => {
    writeSeq.current += 1;
    writesInFlight.current = Math.max(0, writesInFlight.current - 1);
    if (writesInFlight.current === 0) {
      const waiters = writeWaiters.current;
      writeWaiters.current = [];
      waiters.forEach((resolve) => resolve());
    }
  }, []);
  const writesSettled = useCallback(() => (
    writesInFlight.current === 0
      ? Promise.resolve()
      : new Promise((resolve) => { writeWaiters.current.push(resolve); })
  ), []);

  /* ---------- status changes: one at a time per task (1.21) ---------- */

  // A quick tick then un-tick sends two mutations; their answers can arrive in
  // either order, and the later answer used to win on screen whatever the
  // server ended with. They are now sent one after the other per task, and
  // only the newest request's answer is applied. A `virtual_` occurrence
  // gets a real id from its first answer; later requests use it (`aliases`).
  const statusChains = useRef(new Map());
  const statusTickets = useRef(new Map());
  const aliases = useRef(new Map());
  const resolveId = useCallback((id) => aliases.current.get(String(id)) || id, []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Every request in this app goes through Apollo, so errors arrive as
   * ApolloError: { graphQLErrors: [...], networkError, message }.
   *
   * Records a `{ type, message }` on context state and returns the message.
   * It intentionally does NOT rethrow; callers that need the rejection to
   * propagate rethrow explicitly.
   */
  const handleApiError = useCallback((err, fallback = 'An unexpected error occurred') => {
    const gqlErrors = err?.graphQLErrors ?? [];
    const networkError = err?.networkError ?? (err?.name === 'TimeoutError' ? err : null);
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
      if (networkError.name === 'TimeoutError' || networkError.timeout) {
        type = TaskError.NETWORK;
        message = 'TodoGeek did not answer in time. Check your connection and try again.';
      } else if (networkError.statusCode === 401 || networkError.statusCode === 403) {
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

  /* ---------- reads ---------- */

  const runQuery = useCallback(async (viewType, date) => {
    switch (viewType) {
      case 'daily': {
        const dateStr = format(date || new Date(), 'yyyy-MM-dd');
        const dRes = await apolloClient.query({
          query: GET_DAILY_TASKS,
          variables: { tzOffsetMinutes: tzOffsetFor(date || new Date()), date: dateStr },
          fetchPolicy: 'no-cache'
        });
        return dRes.data?.dailyTasks || [];
      }
      case 'weekly': {
        // `weekStartsOn: 1` — Monday is the app's week (utils/reviewWeek.js).
        const startDate = startOfWeek(date || new Date(), { weekStartsOn: 1 });
        const wRes = await apolloClient.query({
          query: GET_WEEKLY_TASKS,
          variables: {
            date: format(startDate, 'yyyy-MM-dd'),
            tzOffsetMinutes: tzOffsetFor(startDate),
          },
          fetchPolicy: 'no-cache'
        });
        return wRes.data?.weeklyTasks || [];
      }
      case 'monthly': {
        const monthStart = startOfMonth(date || new Date());
        const monthEnd = endOfMonth(date || new Date());
        const mRes = await apolloClient.query({
          query: GET_MONTHLY_TASKS,
          variables: {
            startDate: format(monthStart, 'yyyy-MM-dd'),
            endDate: format(monthEnd, 'yyyy-MM-dd'),
            tzOffsetMinutes: tzOffsetFor(monthStart),
          },
          fetchPolicy: 'no-cache'
        });
        return mRes.data?.monthlyTasks || [];
      }
      case 'year':
      default: {
        const aRes = await apolloClient.query({
          query: GET_ALL_TASKS,
          fetchPolicy: 'no-cache'
        });
        return aRes.data?.allTasks || [];
      }
    }
  }, [apolloClient]);

  /**
   * Load a view. Resolves `{ status }`:
   *   'ok'         — applied
   *   'superseded' — a newer fetch started; this answer was dropped
   *   'stale'      — every attempt overlapped a local write; nothing applied
   *   'error'      — failed (`error` is set); the list on screen is untouched
   */
  const fetchTasks = useCallback(async (viewType, date) => {
    const mine = ++fetchSeq.current;
    setLoading(LoadingState.FETCHING);
    setError(null);
    let doubtedEmpty = false;
    try {
      for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
        // Never read across a write that is already in flight.
        await writesSettled();
        if (mine !== fetchSeq.current) return { status: 'superseded' };
        const seqAtStart = writeSeq.current;
        const responseData = await runQuery(viewType, date);
        if (mine !== fetchSeq.current) return { status: 'superseded' };
        // A local write began or ended while this read was out: the answer
        // may not include it. Read again.
        if (writeSeq.current !== seqAtStart || writesInFlight.current > 0) continue;
        // An empty answer for a list that is not empty is asked twice.
        const holding = Array.isArray(tasksRef.current) && tasksRef.current.length > 0;
        if (responseData.length === 0 && holding && !doubtedEmpty) {
          doubtedEmpty = true;
          continue;
        }
        commit(ingest(responseData));
        setCurrentView(viewType);
        setCurrentDate(date || new Date());
        return { status: 'ok' };
      }
      return { status: 'stale' };
    } catch (err) {
      if (mine !== fetchSeq.current) return { status: 'superseded' };
      console.error('Error fetching tasks:', err);
      handleApiError(err, 'Failed to fetch tasks');
      return { status: 'error', error: err };
    } finally {
      if (mine === fetchSeq.current) setLoading(LoadingState.IDLE);
    }
  }, [handleApiError, runQuery, writesSettled, commit]);

  /* ---------- writes ---------- */

  /**
   * Create a task. `taskData.clientId` makes it idempotent (contract C1): a
   * caller retrying a failed or timed-out create passes the SAME clientId,
   * and the gateway hands back the task the first attempt made. One is made
   * up here when the caller sends none; it rides on the thrown error
   * (`err.clientId`) so the caller can retry with it.
   *
   * A repeating task comes back as its series MASTER, which no list shows
   * (`allTasks` returns its occurrences). It is not added to state; the
   * caller refetches to get the occurrence rows (plan 1.6).
   */
  const createTask = useCallback(async (taskData) => {
    const variables = withDueFlag({ ...taskData });
    if (!variables.clientId) variables.clientId = newClientId();
    if (variables.recurrenceRule && !variables.timeZone) {
      const zone = localTimeZone();
      if (zone) variables.timeZone = zone;
    }
    beginWrite();
    setLoading(LoadingState.CREATING);
    setError(null);
    try {
      const response = await apolloClient.mutate({
        mutation: CREATE_TASK,
        variables,
        // Clause 3: a new task changes the tag index and, if it is filed, its
        // collection's tallies. Both are the gateway's to compute.
        update: onTaskCreated,
        context: WRITE_CONTEXT,
      });

      const createdTask = withExplicitTime(response.data?.createTask);
      if (createdTask && !createdTask.isSeriesMaster) {
        // A replayed create returns a task we may already hold: replace, never duplicate.
        commit((prevTasks) => {
          const list = Array.isArray(prevTasks) ? prevTasks : [];
          return list.some((t) => sameTask(t, createdTask.id))
            ? list.map((t) => (sameTask(t, createdTask.id) ? { ...t, ...createdTask } : t))
            : [...list, createdTask];
        });
      }
      return createdTask;
    } catch (err) {
      handleApiError(err, 'Failed to create task');
      if (err && typeof err === 'object') err.clientId = variables.clientId;
      throw err;
    } finally {
      setLoading(LoadingState.IDLE);
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  /**
   * Update a task. `options.optimistic` shows the change at once and puts the
   * row back if the server refuses (moves: swipe, pick a date, move all —
   * 3.18); without it the list changes when the answer comes.
   */
  const updateTask = useCallback(async (rawTaskId, updates, editScope = 'THIS_INSTANCE', options = {}) => {
    const taskId = resolveId(rawTaskId);
    const snapshot = options.optimistic
      ? (findTaskInState(tasksRef.current, taskId) || findTaskInState(tasksRef.current, rawTaskId))
      : null;
    beginWrite();
    try {
      setLoading(LoadingState.UPDATING);
      setError(null);

      const ALLOWED_UPDATE_FIELDS = [
        'content', 'signifier', 'status', 'priority', 'note',
        'tags', 'dueDate', 'isBacklog', 'recurrenceRule',
        // null files the task out of its collection; a string moves it.
        'collectionId',
        // Private: hide the words on a desktop (PrivacyContext).
        'private',
        // Contract C2, and a repeat's wall-clock zone.
        'hasDueTime', 'timeZone',
      ];
      let cleanUpdates = {};
      for (const key of ALLOWED_UPDATE_FIELDS) {
        if (key in updates) {
          cleanUpdates[key] = updates[key];
        }
      }
      cleanUpdates = withDueFlag(cleanUpdates);
      if (cleanUpdates.recurrenceRule && !cleanUpdates.timeZone) {
        const zone = localTimeZone();
        if (zone) cleanUpdates.timeZone = zone;
      }

      if (snapshot) {
        const patch = { ...cleanUpdates };
        if ('dueDate' in patch) {
          // State keeps dates as ISO instants; a date-only one is its UTC midnight.
          const v = patch.dueDate;
          patch.dueDate = !v ? null
            : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : new Date(v).toISOString());
        }
        commit(prev => mapTasksState(prev, task => (
          (sameTask(task, taskId) || sameTask(task, rawTaskId)) ? { ...task, ...patch } : task
        )));
      }

      // The result knows where the task landed; only the client knows where it
      // came from, so the previous collection is closed over for the update.
      const previousCollectionId = (snapshot || findTaskInState(tasksRef.current, taskId))?.collectionId ?? null;

      const response = await apolloClient.mutate({
        mutation: UPDATE_TASK,
        variables: { id: taskId, input: cleanUpdates, editScope },
        update: onTaskUpdated(previousCollectionId),
        context: WRITE_CONTEXT,
      });

      const updatedTask = withExplicitTime(response.data?.updateTask);

      // `mapTasksState` patches the task wherever it is — top-level row or one
      // of a parent's steps — and re-sorts. Merging rather than replacing also
      // keeps fields the mutation does not select (subtaskCount, originalDueDate).
      if (updatedTask) {
        commit(prev => mapTasksState(prev, task => (
          (sameTask(task, taskId) || sameTask(task, rawTaskId)) ? { ...task, ...updatedTask } : task
        )));
      }

      setLoading(LoadingState.IDLE);
      return updatedTask;
    } catch (err) {
      if (snapshot) {
        commit(prev => mapTasksState(prev, task => (
          (sameTask(task, taskId) || sameTask(task, rawTaskId)) ? snapshot : task
        )));
      }
      handleApiError(err, 'Failed to update task');
      setLoading(LoadingState.IDLE);
      throw err;
    } finally {
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit, resolveId]);

  /**
   * Optimistic status toggle: flip the task in local state immediately so the
   * checkbox responds instantly, then reconcile with the server response.
   * On failure the previous task object is restored and the error surfaced.
   *
   * Per task, requests go one at a time and only the newest one's answer is
   * applied (see `statusChains`). `options.editScope` is passed through for a
   * series master (ALL_INSTANCES finishes the whole series).
   */
  const updateTaskStatus = useCallback(async (taskId, newStatus, options = {}) => {
    const key = String(taskId);
    const snapshot = findTaskInState(tasksRef.current, resolveId(taskId)) || findTaskInState(tasksRef.current, taskId);
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
    const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;
    const ticket = (statusTickets.current.get(key) || 0) + 1;
    statusTickets.current.set(key, ticket);
    const isLatest = () => statusTickets.current.get(key) === ticket;
    const isThisTask = (task, id) => sameTask(task, taskId) || sameTask(task, id);

    setError(null);
    commit(prev => mapTasksState(prev, task => (
      isThisTask(task, resolveId(taskId)) ? { ...task, status: newStatus, completedAt, cancelledAt } : task
    )));

    beginWrite();
    const prior = statusChains.current.get(key) || Promise.resolve();
    const run = prior.catch(() => {}).then(async () => {
      const id = resolveId(taskId);
      const variables = { id, status: newStatus };
      if (options.editScope) variables.editScope = options.editScope;
      const response = await apolloClient.mutate({
        mutation: UPDATE_TASK_STATUS,
        variables,
        // Ticking a checkbox is this app's most-repeated gesture; it must not
        // wait on a round trip. Apollo writes this layer immediately and rolls
        // the whole thing back if the mutation rejects.
        optimisticResponse: buildOptimisticStatus(snapshot, id, newStatus, completedAt, cancelledAt),
        update: onTaskStatusChanged(snapshot?.collectionId ?? null),
        context: WRITE_CONTEXT,
      });
      return { id, serverTask: response.data?.updateTaskStatus };
    });
    statusChains.current.set(key, run);

    try {
      const { id, serverTask } = await run;
      if (serverTask) {
        const serverId = String(serverTask.id ?? serverTask._id ?? '');
        if (serverId && serverId !== String(id)) {
          aliases.current.set(key, serverId);
          aliases.current.set(String(id), serverId);
        }
        commit(prev => mapTasksState(prev, task => {
          if (!isThisTask(task, id)) return task;
          // Only the newest request's answer decides what the row says; an
          // older one still hands over the real id a virtual occurrence got.
          return isLatest()
            ? withExplicitTime({ ...task, ...serverTask })
            : { ...task, id: serverTask.id ?? task.id };
        }));
      }
      if (isLatest()) setError(null);
      return serverTask;
    } catch (error) {
      if (isLatest() && snapshot) {
        // Roll back to the pre-toggle task object.
        commit(prev => mapTasksState(prev, task => (
          isThisTask(task, resolveId(taskId)) ? snapshot : task
        )));
      }
      handleApiError(error, 'Failed to update task status');
      return undefined;
    } finally {
      if (statusChains.current.get(key) === run && isLatest()) statusChains.current.delete(key);
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit, resolveId]);

  /**
   * Park a task ("blocked"). Not optimistic — `blockedAt` is the server's
   * clock and the gateway refuses to block a completed/cancelled task.
   */
  const blockTask = useCallback(async (taskId, reason) => {
    setError(null);
    beginWrite();
    try {
      const response = await apolloClient.mutate({
        mutation: BLOCK_TASK,
        variables: { id: taskId, reason: reason?.trim() ? reason.trim() : null },
        update: onTaskStatusChanged(findTaskInState(tasksRef.current, taskId)?.collectionId ?? null),
      });

      const serverTask = response.data?.blockTask;
      if (serverTask) {
        commit(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...serverTask } : task
        )));
      }
      return serverTask;
    } catch (error) {
      handleApiError(error, 'Failed to block task');
      return undefined;
    } finally {
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  /** Un-park a task: back to `pending`, blocked fields cleared, dueDate kept. */
  const unblockTask = useCallback(async (taskId) => {
    setError(null);
    beginWrite();
    try {
      const response = await apolloClient.mutate({
        mutation: UNBLOCK_TASK,
        variables: { id: taskId },
        update: onTaskStatusChanged(findTaskInState(tasksRef.current, taskId)?.collectionId ?? null),
      });

      const serverTask = response.data?.unblockTask;
      if (serverTask) {
        commit(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...serverTask } : task
        )));
      }
      return serverTask;
    } catch (error) {
      handleApiError(error, 'Failed to unblock task');
      return undefined;
    } finally {
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  /**
   * Delete a task. Returns TRUE only when the server confirmed it.
   *
   * `editScope` defaults to THIS_INSTANCE. (The retired screens prompted for a
   * scope here with a dialog; every live caller passes one.)
   */
  const deleteTask = useCallback(async (rawTaskId, editScopeParam = null) => {
    const taskId = resolveId(rawTaskId);
    const editScope = editScopeParam || 'THIS_INSTANCE';
    beginWrite();
    try {
      const task = getTaskFromState(taskId) || getTaskFromState(rawTaskId);
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
        context: WRITE_CONTEXT,
      });

      commit(prev => removeTaskFromState(removeTaskFromState(prev, taskId), rawTaskId));
      return true;
    } catch (error) {
      handleApiError(error, 'Failed to delete task');
      return false;
    } finally {
      setLoading(LoadingState.IDLE);
      endWrite();
    }
  }, [apolloClient, handleApiError, getTaskFromState, beginWrite, endWrite, commit, resolveId]);

  /**
   * Drop the not-yet-materialised occurrences of a series that fall before
   * `before` (decision D3): when the late row is finished, the misses behind
   * it are skipped — the gateway stops expanding them (`skipMissedBefore`),
   * and this keeps the list on screen from showing the next one meanwhile.
   */
  const skipEarlierOccurrences = useCallback((seriesId, before) => {
    if (!seriesId || !before) return;
    const cutoff = new Date(before).getTime();
    if (Number.isNaN(cutoff)) return;
    commit(prev => (Array.isArray(prev) ? prev.filter((t) => !(
      String(t?.id ?? '').startsWith('virtual_')
      && String(t.seriesId) === String(seriesId)
      && t.status !== 'completed' && t.status !== 'cancelled'
      && new Date(t.dueDate).getTime() < cutoff
    )) : prev));
  }, [commit]);

  // Migration operations
  const migrateTask = useCallback(async (taskId, targetDate) => {
    beginWrite();
    try {
      setLoading(LoadingState.MIGRATING);
      setError(null);

      const response = await apolloClient.mutate({
        mutation: MIGRATE_TASK_TO_FUTURE,
        variables: { id: taskId, futureDate: format(targetDate, 'yyyy-MM-dd') },
        update: onTaskUpdated(null),
      });

      const migratedTask = response.data?.migrateTaskToFuture;

      // Merge the authoritative object in place, exactly like updateTaskStatus
      // does (this once rebuilt a keyed-by-date object and threw on arrays).
      if (migratedTask) {
        commit(prev => mapTasksState(prev, task => (
          sameTask(task, taskId) ? { ...task, ...migratedTask } : task
        )));
      }

      return migratedTask;
    } catch (error) {
      handleApiError(error, 'Failed to migrate task');
    } finally {
      setLoading(LoadingState.IDLE);
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  /**
   * Add a step to an entry (gateway subtask API, kept). The step is appended
   * to its parent's `subtasks` array, never added as a top-level row.
   */
  const addSubtask = useCallback(async (parentId, input) => {
    setError(null);
    beginWrite();
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

      commit(prev => mapTasksState(prev, task => {
        if (!sameTask(task, parentId)) return task;
        const children = Array.isArray(task.subtasks) ? task.subtasks : [];
        if (children.some(child => sameTask(child, subtask.id))) return task;
        return { ...task, subtasks: [...children, subtask] };
      }));

      return subtask;
    } catch (error) {
      handleApiError(error, 'Failed to add subtask');
      return undefined;
    } finally {
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  /**
   * Reorder an entry's steps (optimistic; the pre-move order is restored on
   * failure). `orderedSubtaskIds` must name every one of them exactly once.
   */
  const reorderSubtasks = useCallback(async (parentId, orderedSubtaskIds) => {
    setError(null);
    const snapshot = findTaskInState(tasksRef.current, parentId);
    const previous = Array.isArray(snapshot?.subtasks) ? snapshot.subtasks : [];

    const byId = new Map(previous.map(child => [String(child.id ?? child._id), child]));
    const reordered = orderedSubtaskIds.map(id => byId.get(String(id))).filter(Boolean);
    if (reordered.length === previous.length) {
      commit(prev => mapTasksState(prev, task => (
        sameTask(task, parentId) ? { ...task, subtasks: reordered } : task
      )));
    }

    beginWrite();
    try {
      const response = await apolloClient.mutate({
        mutation: REORDER_SUBTASKS,
        variables: { parentId, orderedSubtaskIds },
      });
      return response.data?.reorderSubtasks;
    } catch (error) {
      commit(prev => mapTasksState(prev, task => (
        sameTask(task, parentId) ? { ...task, subtasks: previous } : task
      )));
      handleApiError(error, 'Failed to reorder subtasks');
      return undefined;
    } finally {
      endWrite();
    }
  }, [apolloClient, handleApiError, beginWrite, endWrite, commit]);

  const value = useMemo(() => ({
    // State
    tasks,
    loading,
    error,
    currentView,
    currentDate,

    // Error handling
    clearError,

    // Task operations
    fetchTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    blockTask,
    unblockTask,
    deleteTask,
    migrateTask,
    skipEarlierOccurrences,

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
    currentView,
    currentDate,
    fetchTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    blockTask,
    unblockTask,
    deleteTask,
    migrateTask,
    skipEarlierOccurrences,
    addSubtask,
    reorderSubtasks,
    getTaskFromState,
    clearError
  ]);

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

export { TaskProvider };
export default TaskProvider;
