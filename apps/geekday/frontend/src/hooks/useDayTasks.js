/**
 * One day's TodoGeek tasks, and the three things the page does to them:
 * tick, move to the next day, add (spec reqs 1–4, 13).
 *
 * The list lives in React state, read with `no-cache`: every change is shown
 * at once and rolled back if the gateway refuses it, and a failed re-read
 * never empties a list that is already on screen (the suite's rule: a failure
 * must not look like "nothing to do").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { useRefetchOnResume } from '@geeksuite/ui';
import { CREATE_DAY_TASK, GET_DAY_TASKS, MOVE_DAY_TASK, SET_DAY_TASK_STATUS } from '../graphql/documents.js';
import { tzOffsetFor } from '../lib/days.js';
import { dueDayKey, dueFieldsOn, groupDayTasks, hasDueTime, isDone, nextDayKey } from '../lib/tasks.js';

const READ_TIMEOUT_MS = 15000;
const WRITE_TIMEOUT_MS = 15000;
const POLL_MS = 5 * 60 * 1000;

export function useDayTasks(dayKey, today) {
  const client = useApolloClient();
  const [tasks, setTasks] = useState([]);
  /** 'loading' | 'ready' | 'error' — 'error' only when there is no list to show. */
  const [status, setStatus] = useState('loading');
  /** True when the list on screen is older than a re-read that just failed. */
  const [stale, setStale] = useState(false);
  const seq = useRef(0);
  const loaded = useRef(false);
  /** Bumped by every local change, so a read that started before it is not applied over it. */
  const writes = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const writesAtStart = writes.current;
    try {
      const { data } = await client.query({
        query: GET_DAY_TASKS,
        variables: { date: dayKey, tzOffsetMinutes: tzOffsetFor(dayKey) },
        fetchPolicy: 'no-cache',
        context: { timeoutMs: READ_TIMEOUT_MS },
      });
      if (mine !== seq.current) return;
      // A change made while this read was in the air is newer than its answer.
      if (writesAtStart !== writes.current) return;
      loaded.current = true;
      setTasks(data?.dailyTasks || []);
      setStatus('ready');
      setStale(false);
    } catch {
      if (mine !== seq.current) return;
      if (loaded.current) setStale(true);
      else setStatus('error');
    }
  }, [client, dayKey]);

  // A new day is a new list: never show yesterday's rows under today's date.
  useEffect(() => {
    loaded.current = false;
    setTasks([]);
    setStatus('loading');
    setStale(false);
    load();
    return () => {
      seq.current += 1;
    };
  }, [load]);

  useRefetchOnResume(load, { pollMs: POLL_MS });

  const retry = useCallback(() => {
    if (!loaded.current) setStatus('loading');
    return load();
  }, [load]);

  const patch = useCallback((id, next) => {
    writes.current += 1;
    setTasks((list) => list.map((task) => (task.id === id ? (typeof next === 'function' ? next(task) : next) : task)));
  }, []);

  /** Tick or un-tick. Resolves to the saved task; rejects (after rolling back) if the gateway refuses. */
  const toggleDone = useCallback(
    async (task) => {
      const status_ = isDone(task) ? 'pending' : 'completed';
      const optimistic = {
        ...task,
        status: status_,
        completedAt: status_ === 'completed' ? new Date().toISOString() : null,
      };
      patch(task.id, optimistic);
      try {
        const { data } = await client.mutate({
          mutation: SET_DAY_TASK_STATUS,
          variables: { id: task.id, status: status_ },
          context: { timeoutMs: WRITE_TIMEOUT_MS },
        });
        const saved = data?.updateTaskStatus;
        // Ticking one occurrence of a repeating task answers with a new, real id: adopt it.
        if (saved) patch(task.id, saved);
        return saved || optimistic;
      } catch (error) {
        patch(task.id, task);
        throw error;
      }
    },
    [client, patch]
  );

  /** Move to `targetKey` (default: the day after the one on screen). Resolves to the saved task. */
  const moveTo = useCallback(
    async (task, targetKey = nextDayKey(dayKey)) => {
      const fields = dueFieldsOn(task, targetKey);
      const optimistic = { ...task, ...fields, dueDate: fields.hasDueTime ? fields.dueDate : `${fields.dueDate}T00:00:00.000Z` };
      patch(task.id, optimistic);
      try {
        const { data } = await client.mutate({
          mutation: MOVE_DAY_TASK,
          variables: { id: task.id, input: fields },
          context: { timeoutMs: WRITE_TIMEOUT_MS },
        });
        const saved = data?.updateTask;
        if (saved) patch(task.id, saved);
        return saved || optimistic;
      } catch (error) {
        patch(task.id, task);
        throw error;
      }
    },
    [client, dayKey, patch]
  );

  /** Undo a move: give `current` back the due date `original` had (a time, a date, or none). */
  const restoreDue = useCallback(
    async (current, original) => {
      const input = { dueDate: original.dueDate || null, hasDueTime: hasDueTime(original) };
      patch(current.id, { ...current, dueDate: original.dueDate || null, hasDueTime: input.hasDueTime });
      try {
        const { data } = await client.mutate({
          mutation: MOVE_DAY_TASK,
          variables: { id: current.id, input },
          context: { timeoutMs: WRITE_TIMEOUT_MS },
        });
        if (data?.updateTask) patch(current.id, data.updateTask);
      } catch (error) {
        patch(current.id, current);
        throw error;
      }
    },
    [client, patch]
  );

  /** Create a task from `createTask` variables (lib/capture.js). `clientId` makes a retry a no-op. */
  const addTask = useCallback(
    async (input, clientId) => {
      const { data } = await client.mutate({
        mutation: CREATE_DAY_TASK,
        variables: { ...input, clientId },
        context: { timeoutMs: WRITE_TIMEOUT_MS },
      });
      const created = data?.createTask;
      if (!created) throw new Error('createTask returned no task');
      if (created.isSeriesMaster) {
        // A repeating task answers with its series row, which no list shows; read the day again for its occurrences.
        load();
      } else {
        writes.current += 1;
        setTasks((list) => (list.some((task) => task.id === created.id) ? list : [...list, created]));
      }
      return created;
    },
    [client, load]
  );

  const groups = useMemo(() => groupDayTasks(tasks, dayKey, today), [tasks, dayKey, today]);

  return { groups, status, stale, retry, toggleDone, moveTo, restoreDue, addTask };
}

/** Whether a task created or moved just now belongs on the page for `dayKey`. */
export const landsOn = (task, dayKey) => dueDayKey(task) === dayKey;
