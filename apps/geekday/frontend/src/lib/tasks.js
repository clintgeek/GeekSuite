/**
 * Reading a day's TodoGeek tasks. Pure: no React, no network.
 *
 * The gateway's `dailyTasks` answers one flat list (due that day, overdue,
 * undated, done that day); grouping is the client's job, exactly as it is on
 * TodoGeek's Today (apps/todogeek/frontend/src/utils/penViews.js, dueDate.js —
 * the rules below are those rules, restated for an arbitrary day).
 *
 * A due date is one of two things (DOCS/THE_CONTEXT.md §3.1):
 *   date-only  UTC midnight of the calendar day; read with UTC accessors
 *   timed      a real instant; read in the local zone
 */
import { localDateString, utcDateString } from '@geeksuite/utils';
import { addDays, keyToDate } from './days.js';

const DONE = new Set(['completed', 'cancelled']);

export const isDone = (task) => DONE.has(task?.status);

const isUtcMidnight = (date) =>
  date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;

/** The task's own flag wins; rows older than the flag fall back to "not exactly UTC midnight". */
export function hasDueTime(task) {
  if (!task?.dueDate) return false;
  if (typeof task.hasDueTime === 'boolean') return task.hasDueTime;
  const date = new Date(task.dueDate);
  return !Number.isNaN(date.getTime()) && !isUtcMidnight(date);
}

/** The calendar day a task is due, as a key; '' when undated. */
export function dueDayKey(task) {
  if (!task?.dueDate) return '';
  return hasDueTime(task) ? localDateString(task.dueDate) : utcDateString(task.dueDate);
}

const priorityRank = (task) => (task.priority >= 1 && task.priority <= 3 ? task.priority : 4);
const dueMs = (task) => (task.dueDate ? new Date(task.dueDate).getTime() : Number.MAX_SAFE_INTEGER);
const createdMs = (task) => (task.createdAt ? new Date(task.createdAt).getTime() : 0);

const byTime = (a, b) => dueMs(a) - dueMs(b) || priorityRank(a) - priorityRank(b) || String(a.id).localeCompare(String(b.id));
const byPriority = (a, b) =>
  priorityRank(a) - priorityRank(b) || createdMs(a) - createdMs(b) || String(a.id).localeCompare(String(b.id));

/** A repeating task's missed occurrences collapse to the latest one. */
function latestPerSeries(tasks) {
  const single = [];
  const latest = new Map();
  for (const task of tasks) {
    if (!task.seriesId) {
      single.push(task);
      continue;
    }
    const seen = latest.get(task.seriesId);
    if (!seen || dueMs(task) > dueMs(seen)) latest.set(task.seriesId, task);
  }
  return [...single, ...latest.values()];
}

/**
 * Group one day's list for the page (spec reqs 1 and 13).
 *
 *   overdue  open, due before the day — on TODAY'S page only. Their dates are
 *            never changed here; the user moves them or they stay overdue.
 *   timed    open, due on the day at a time of day
 *   untimed  open, due on the day with no time; on today's page also the
 *            open tasks that have no date at all
 *   done     finished tasks that belong to the day, so a tick stays visible
 *
 * @param {object[]} tasks  the `dailyTasks` answer for `dayKey`
 * @param {string} dayKey   the day on screen
 * @param {string} today    today's key
 */
export function groupDayTasks(tasks, dayKey, today) {
  const isToday = dayKey === today;
  const overdue = [];
  const timed = [];
  const untimed = [];
  const done = [];

  for (const task of tasks || []) {
    if (!task || task.isSeriesMaster) continue;
    const key = dueDayKey(task);
    if (isDone(task)) {
      // Done rows belong to the day they were due; undated ones to the day they were finished.
      const finished = task.completedAt || task.cancelledAt;
      const doneKey = key || (finished ? localDateString(finished) : '');
      if (doneKey === dayKey) done.push(task);
      continue;
    }
    if (!key) {
      if (isToday) untimed.push(task);
    } else if (key < dayKey) {
      if (isToday) overdue.push(task);
    } else if (key === dayKey) {
      (hasDueTime(task) ? timed : untimed).push(task);
    }
  }

  return {
    overdue: latestPerSeries(overdue).sort(byTime),
    timed: timed.sort(byTime),
    untimed: untimed.sort(byPriority),
    done: done.sort(byTime),
  };
}

export const openCount = (groups) => groups.overdue.length + groups.timed.length + groups.untimed.length;

/**
 * The due date a task takes when moved to `targetKey`: a date-only task stays
 * date-only; a timed task keeps its local clock time on the new day.
 * Returns `{ dueDate, hasDueTime }` ready for `updateTask` — the flag is
 * always sent, so the gateway never has to guess it from the value.
 */
export function dueFieldsOn(task, targetKey) {
  if (!hasDueTime(task)) return { dueDate: targetKey, hasDueTime: false };
  const old = new Date(task.dueDate);
  const day = keyToDate(targetKey);
  const moved = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes(), 0, 0);
  // 6pm US-Central is exactly UTC midnight, which reads as "date-only" to
  // older code; a timed value is never left on that instant.
  if (isUtcMidnight(moved)) moved.setUTCSeconds(1);
  return { dueDate: moved.toISOString(), hasDueTime: true };
}

/** Where "move to the next day" sends a task from the page for `dayKey`. */
export const nextDayKey = (dayKey) => addDays(dayKey, 1);

/** "2:30 PM" for a timed task, '' otherwise. */
export function clockLabel(task, locale) {
  if (!hasDueTime(task)) return '';
  return new Date(task.dueDate).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The task the docked view shows: the next timed task still ahead today, else
 * the first overdue one, else the first untimed one. Null when the day is clear.
 */
export function nextTask(groups, now = new Date()) {
  const ahead = groups.timed.find((task) => new Date(task.dueDate).getTime() >= now.getTime());
  if (ahead) return { task: ahead, kind: 'timed' };
  // A timed task whose hour has passed is still the thing to do next.
  if (groups.timed.length) return { task: groups.timed[groups.timed.length - 1], kind: 'late' };
  if (groups.overdue.length) return { task: groups.overdue[0], kind: 'overdue' };
  if (groups.untimed.length) return { task: groups.untimed[0], kind: 'untimed' };
  return null;
}
