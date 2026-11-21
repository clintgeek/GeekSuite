/**
 * Reading a week of TodoGeek tasks (DOCS/GEEKDAY_SPEC.md §6). Pure: no React,
 * no network. The rules for one day are lib/tasks.js's; this file only lays
 * seven of those days side by side and adds the eighth cell.
 */
import { addWeeks } from './days.js';
import { dueDayKey, groupDayTasks } from './tasks.js';

/**
 * Several gateway answers as one list, one row per id. The same task is in
 * more than one answer as a matter of course (a task due today is in both the
 * week's list and today's); the first answer that has it wins.
 */
export function mergeTaskLists(...lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const task of list || []) {
      if (task && task.id != null && !seen.has(task.id)) seen.set(task.id, task);
    }
  }
  return [...seen.values()];
}

/**
 * Lay the merged list out as the spread (W1, W3).
 *
 *   days[key]    what is DUE on that day: timed, then untimed, then done.
 *                An unfinished task on a day that has passed stays in that
 *                day's cell — that is its date, and GeekDay never re-dates a
 *                task the user did not move.
 *   unscheduled  the eighth cell: open tasks with no date, and open tasks
 *                overdue (due before today) that are not already in one of
 *                the seven cells on screen. So every task is on the page once.
 *
 * Each day goes through `groupDayTasks`, so a day cell and that day's page
 * can never disagree about what belongs to the day or in what order.
 *
 * @param {object[]} tasks  the merged list
 * @param {string[]} keys   the seven day keys on screen, Monday first
 * @param {string} today    today's key
 */
export function groupWeek(tasks, keys, today) {
  const onScreen = new Set(keys);
  const days = {};
  for (const key of keys) {
    const group = groupDayTasks(tasks, key, today);
    // On today's page the untimed group also holds the undated tasks; here those belong to the eighth cell.
    const untimed = group.untimed.filter((task) => dueDayKey(task) === key);
    days[key] = { timed: group.timed, untimed, done: group.done, open: group.timed.length + untimed.length };
  }

  // Exactly what the day page calls overdue and undated today (missed
  // occurrences of a repeating task already collapsed to the latest one).
  const now = groupDayTasks(tasks, today, today);
  const overdue = now.overdue.filter((task) => !onScreen.has(dueDayKey(task)));
  const undated = now.untimed.filter((task) => !dueDayKey(task));

  return { days, unscheduled: { overdue, undated, open: overdue.length + undated.length } };
}

/**
 * Which rows a cell that cannot scroll shows in `capacity` row-heights.
 *
 *   everything fits          → every open row, then every done row
 *   the done rows do not fit → the open rows and one "n done" line
 *   the open rows do not fit → as many as fit above a "+N more" line (which
 *                              opens the day); N counts open tasks only
 *
 * @param {object[]} open  open rows, in display order
 * @param {object[]} done  done rows
 * @param {number} capacity  whole rows that fit; Infinity (or anything not finite) shows all
 * @returns {{ open: object[], done: object[], doneCollapsed: number, more: number }}
 */
export function fitRows(open, done, capacity) {
  const all = { open, done, doneCollapsed: 0, more: 0 };
  if (!Number.isFinite(capacity)) return all;
  const room = Math.max(1, Math.floor(capacity));
  if (open.length + done.length <= room) return all;
  if (open.length + 1 <= room) return { open, done: [], doneCollapsed: done.length, more: 0 };
  const shown = open.slice(0, room - 1);
  return { open: shown, done: [], doneCollapsed: done.length, more: open.length - shown.length };
}

/**
 * Where "Next week" sends a task from the week on screen: the same weekday
 * one week on for a task in one of the seven cells; the Monday after the week
 * on screen for a task from the eighth cell, which has no weekday to keep.
 */
export function nextWeekTarget(task, keys) {
  const due = dueDayKey(task);
  return addWeeks(due && keys.includes(due) ? due : keys[0], 1);
}
