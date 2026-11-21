/**
 * One week's TodoGeek tasks and what the week page does to them: tick, move
 * to another day, undo a move (DOCS/GEEKDAY_SPEC.md §6, W1, W3–W5, W9).
 *
 * WHAT THE GATEWAY ANSWERS (read in apps/basegeek/packages/api/src/graphql/
 * todogeek/services/taskService.js, `getTasksForDateRange`, 2026-11-20):
 *
 *   weeklyTasks(date, tzOffsetMinutes)        viewType 'weekly'
 *     Snaps `date` to its Monday and answers, as one flat list:
 *       - every row due Monday..Sunday, whatever its status (date-only rows by
 *         their UTC midnight; timed rows inside the LOCAL window the single
 *         `tzOffsetMinutes` describes)
 *       - one virtual row (`virtual_<series>_<ms>`, status pending) per
 *         occurrence of a repeating task inside the week that has not been
 *         materialised; NO carried-forward occurrence from before the week
 *       - done rows last UPDATED in the week, whatever their due date
 *       - pending rows with no date
 *       - open rows due before the week's MONDAY
 *     Never: series masters, backlog, blocked, undated collection entries.
 *
 *   dailyTasks(date, tzOffsetMinutes)         viewType 'daily'
 *     The same for one day, and "overdue" is relative to THAT day, plus the
 *     one thing only this view does: the latest missed occurrence of each
 *     repeating task is carried forward as a virtual row.
 *
 *   monthlyTasks(startDate, endDate, …)       viewType 'monthly'
 *     NOT a date range: `endDate` is never read. It answers the whole
 *     calendar month `startDate` falls in. Not used here — a week that spans
 *     two months would need two of them, and it carries nothing forward.
 *
 * SO THE PAGE SENDS TWO READS, in parallel:
 *   1. weeklyTasks(Monday)   → the seven day cells.
 *   2. dailyTasks(today)     → the eighth cell. `weeklyTasks` cannot supply
 *      it: its overdue is measured from the week's Monday (wrong for any week
 *      but this one), and it never carries a repeating task's missed
 *      occurrence forward. This is the very list the day page shows as
 *      Overdue and undated, so the two pages cannot disagree.
 * The two lists overlap; they are merged by id and grouped in the browser
 * (lib/week.js).
 *
 * A third read happens in one week a year per DST change: `weeklyTasks` takes
 * ONE offset for seven days, so in a week where the clocks change, a timed
 * task in the last (or first) hour of the week falls outside the window that
 * the Monday's offset describes. Such a week is read once per offset.
 *
 * The rest is the day page's rule (hooks/useDayTasks.js): `no-cache`, the
 * list in React state, every change shown at once and rolled back if the
 * gateway refuses it, a failed re-read never empties a week that is on
 * screen, and a failed FIRST read is an error, not an empty week.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { useRefetchOnResume } from '@geeksuite/ui';
import { GET_UNSCHEDULED_TASKS, GET_WEEK_TASKS, MOVE_DAY_TASK, SET_DAY_TASK_STATUS } from '../graphql/documents.js';
import { addWeeks, tzOffsetFor, weekKeys } from '../lib/days.js';
import { dueFieldsOn, hasDueTime, isDone } from '../lib/tasks.js';
import { groupWeek, mergeTaskLists } from '../lib/week.js';

const READ_TIMEOUT_MS = 15000;
const WRITE_TIMEOUT_MS = 15000;
const POLL_MS = 5 * 60 * 1000;

/** The offsets in force during the week starting `monday`: one, or two when the clocks change in it. */
export function weekOffsets(monday) {
  return [...new Set([tzOffsetFor(monday), tzOffsetFor(addWeeks(monday, 1))])];
}

/**
 * @param {string} monday  the key of the week's Monday
 * @param {string} today   today's key
 */
export function useWeekTasks(monday, today) {
  const client = useApolloClient();
  const [tasks, setTasks] = useState([]);
  /** 'loading' | 'ready' | 'error' — 'error' only when there is no week to show. */
  const [status, setStatus] = useState('loading');
  /** True when the week on screen is older than a re-read that just failed. */
  const [stale, setStale] = useState(false);
  const seq = useRef(0);
  const loaded = useRef(false);
  /** Bumped by every local change, so a read that started before it is not applied over it. */
  const writes = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const writesAtStart = writes.current;
    const read = (query, variables) => client.query({ query, variables, fetchPolicy: 'no-cache', context: { timeoutMs: READ_TIMEOUT_MS } });
    try {
      // All or nothing: half an answer would be drawn as a week with less to do than it has.
      const [unscheduled, ...weeks] = await Promise.all([
        read(GET_UNSCHEDULED_TASKS, { date: today, tzOffsetMinutes: tzOffsetFor(today) }),
        ...weekOffsets(monday).map((tzOffsetMinutes) => read(GET_WEEK_TASKS, { date: monday, tzOffsetMinutes })),
      ]);
      if (mine !== seq.current) return;
      // A change made while this read was in the air is newer than its answer.
      if (writesAtStart !== writes.current) return;
      loaded.current = true;
      setTasks(mergeTaskLists(...weeks.map((answer) => answer.data?.weeklyTasks), unscheduled.data?.dailyTasks));
      setStatus('ready');
      setStale(false);
    } catch {
      if (mine !== seq.current) return;
      if (loaded.current) setStale(true);
      else setStatus('error');
    }
  }, [client, monday, today]);

  // A new week is a new list: never show last week's rows under this week's dates.
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
    setTasks((list) => list.map((task) => (task.id === id ? next : task)));
  }, []);

  /** Tick or un-tick (W5). Resolves to the saved task; rejects (after rolling back) if the gateway refuses. */
  const toggleDone = useCallback(
    async (task) => {
      const status_ = isDone(task) ? 'pending' : 'completed';
      const optimistic = { ...task, status: status_, completedAt: status_ === 'completed' ? new Date().toISOString() : null };
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

  /** Move to the day `targetKey` (W4): lib/tasks.js `dueFieldsOn` decides the due date. Resolves to the saved task. */
  const moveTo = useCallback(
    async (task, targetKey) => {
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
        // Moving one occurrence of a repeating task answers with a new, real id too.
        if (saved) patch(task.id, saved);
        return saved || optimistic;
      } catch (error) {
        patch(task.id, task);
        throw error;
      }
    },
    [client, patch]
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

  const keys = useMemo(() => weekKeys(monday), [monday]);
  const groups = useMemo(() => groupWeek(tasks, keys, today), [tasks, keys, today]);

  return { keys, groups, status, stale, retry, toggleDone, moveTo, restoreDue };
}
