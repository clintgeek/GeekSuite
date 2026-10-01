/**
 * penViews.js — what Today, Upcoming, Done and Search show, as pure functions
 * of one task list (DOCS/SIMPLE_PLAN.md § "Three views").
 *
 * All four views read ONE corpus, the gateway's `allTasks`, and slice it here.
 * The old Today asked `dailyTasks`, which drops blocked, backlog and undated
 * collection tasks from the log; those screens are gone, so their tasks have
 * to show up as ordinary tasks somewhere (SIMPLE_PLAN: "The one subtask and
 * the two blocked tasks show as ordinary tasks"). One corpus also means a
 * change made on one view is already right on the next, with no refetch.
 *
 * Days are LOCAL calendar days, keyed `yyyy-MM-dd`. A due date goes through
 * `dueDayKey` (utils/dueDate.js: UTC midnight is date-only, anything else is a
 * local instant); completion stamps are plain instants and go through
 * `localDateString`.
 *
 * Repeating tasks: `allTasks` expands a series a year either side of today as
 * `virtual_…` rows, so a daily series would put 365 past occurrences in
 * Overdue. The daily log only ever carried the most recent missed occurrence
 * forward (taskService.getTasksForDateRange, "Carry-forward logic"), and so
 * does this: past occurrences of one series collapse to the latest. Upcoming's
 * "Later" likewise shows a series once, at its next occurrence.
 */
import { addDays, differenceInCalendarDays, format, nextMonday } from 'date-fns';
import { localDateString } from '@geeksuite/utils';
import { normalizeTag } from '@geeksuite/tags';
import { dueDayKey, dueDayStart, hasDueTime } from './dueDate';

export const UPCOMING_DAYS = 14;

const idOf = (task) => String(task?.id ?? task?._id ?? '');
export const taskId = idOf;

export const isVirtual = (task) => idOf(task).startsWith('virtual_');
export const isDone = (task) => task?.status === 'completed' || task?.status === 'cancelled';
export const isOpen = (task) => Boolean(task) && !isDone(task);

/** Local `yyyy-MM-dd` for a Date (defaults to now). */
export const dayKey = (date = new Date()) => localDateString(date);

/** The local day key a finished task belongs under. */
export function doneDayKey(task) {
  const stamp = task?.completedAt || task?.cancelledAt || task?.updatedAt;
  if (stamp) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) return localDateString(d);
  }
  return dueDayKey(task?.dueDate) || '';
}

/** 1 High, 2 Medium, 3 Low; none sorts last. */
const priorityRank = (task) => {
  const p = Number(task?.priority);
  return Number.isFinite(p) && p >= 1 && p <= 3 ? p : 9;
};

const created = (task) => {
  const t = new Date(task?.createdAt ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Within one day: priority first, then time. A task with a clock time comes
 * before an untimed one of the same priority (it is pinned to a moment; the
 * untimed one can be done whenever), then oldest first.
 */
export function compareWithinDay(a, b) {
  const pa = priorityRank(a);
  const pb = priorityRank(b);
  if (pa !== pb) return pa - pb;
  const ta = hasDueTime(a.dueDate) ? new Date(a.dueDate).getTime() : Infinity;
  const tb = hasDueTime(b.dueDate) ? new Date(b.dueDate).getTime() : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ca = created(a);
  const cb = created(b);
  if (ca !== cb) return ca - cb;
  return idOf(a).localeCompare(idOf(b));
}

const byDue = (a, b) => {
  const ka = dueDayKey(a.dueDate);
  const kb = dueDayKey(b.dueDate);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return compareWithinDay(a, b);
};

/** Keep only the latest occurrence of each series among `tasks` (others untouched). */
function latestPerSeries(tasks) {
  const best = new Map();
  const out = [];
  for (const task of tasks) {
    if (!isVirtual(task) || !task.seriesId) { out.push(task); continue; }
    const prev = best.get(task.seriesId);
    if (!prev || dueDayKey(task.dueDate) > dueDayKey(prev.dueDate)) best.set(task.seriesId, task);
  }
  return [...out, ...best.values()];
}

/** Keep only the first occurrence of each series among `tasks`. */
function firstPerSeries(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    if (!isVirtual(task) || !task.seriesId) return true;
    if (seen.has(task.seriesId)) return false;
    seen.add(task.seriesId);
    return true;
  });
}

/**
 * Does the task carry this tag? Compared in the suite standard
 * (`@geeksuite/tags`), so `GeekSuite`, `geekSuite` and `geek-suite` are one;
 * a null tag matches all.
 */
export function hasTag(task, tag) {
  if (!tag) return true;
  const want = normalizeTag(String(tag));
  return (task?.tags || []).some((t) => normalizeTag(String(t)) === want);
}

export const filterByTag = (tasks, tag) => (tag ? tasks.filter((t) => hasTag(t, tag)) : tasks);

/**
 * Today: overdue (collapsed to a line by the page), today, anytime — and the
 * two counts for the header ("4 to do · 2 done").
 */
export function todaySections(tasks, now = new Date()) {
  const today = dayKey(now);
  const overdue = [];
  const due = [];
  const anytime = [];
  let doneToday = 0;

  for (const task of tasks || []) {
    if (!task) continue;
    if (isDone(task)) {
      if (task.status === 'completed' && doneDayKey(task) === today) doneToday += 1;
      continue;
    }
    const key = dueDayKey(task.dueDate);
    if (!key) anytime.push(task);
    else if (key < today) overdue.push(task);
    else if (key === today) due.push(task);
  }

  const overdueRows = latestPerSeries(overdue).sort(byDue);
  due.sort(compareWithinDay);
  anytime.sort(compareWithinDay);

  return {
    overdue: overdueRows,
    today: due,
    anytime,
    counts: { toDo: overdueRows.length + due.length + anytime.length, done: doneToday },
  };
}

/**
 * Upcoming: the next 14 days as a timetable (only days that have something),
 * then "Later" by month.
 *
 * @returns {{ days: Array<{ key, date, tasks }>, later: Array<{ key, date, tasks }> }}
 */
export function upcomingGroups(tasks, now = new Date(), span = UPCOMING_DAYS) {
  const today = dayKey(now);
  const horizon = dayKey(addDays(now, span));
  const soon = [];
  const later = [];
  for (const task of tasks || []) {
    if (!isOpen(task)) continue;
    const key = dueDayKey(task.dueDate);
    if (!key || key <= today) continue;
    (key <= horizon ? soon : later).push(task);
  }

  const days = new Map();
  for (const task of soon.sort(byDue)) {
    const key = dueDayKey(task.dueDate);
    if (!days.has(key)) days.set(key, { key, date: dueDayStart(task.dueDate), tasks: [] });
    days.get(key).tasks.push(task);
  }

  const months = new Map();
  for (const task of firstPerSeries(later.sort(byDue))) {
    const date = dueDayStart(task.dueDate);
    const key = format(date, 'yyyy-MM');
    if (!months.has(key)) months.set(key, { key, date: new Date(date.getFullYear(), date.getMonth(), 1), tasks: [] });
    months.get(key).tasks.push(task);
  }

  return { days: [...days.values()], later: [...months.values()] };
}

const doneStamp = (task) => {
  const t = new Date(task?.completedAt || task?.cancelledAt || task?.updatedAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Plain-text match on the words, the note and the tags. */
export function matchesQuery(task, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [task?.content, task?.note, ...(task?.tags || []).map((t) => `#${t}`)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** Done: finished tasks by day, newest day first, newest first within it. */
export function doneGroups(tasks, query = '') {
  const groups = new Map();
  const done = (tasks || []).filter((t) => isDone(t) && matchesQuery(t, query));
  done.sort((a, b) => doneStamp(b) - doneStamp(a) || idOf(a).localeCompare(idOf(b)));
  for (const task of done) {
    const key = doneDayKey(task);
    if (!groups.has(key)) {
      const [y, m, d] = (key || '1970-01-01').split('-').map(Number);
      groups.set(key, { key, date: new Date(y, m - 1, d), tasks: [] });
    }
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()];
}

/** Search: open matches (soonest first), then finished ones (newest first). */
export function searchTasks(tasks, query) {
  const q = String(query ?? '').trim();
  if (!q) return { open: [], done: [] };
  const hits = (tasks || []).filter((t) => matchesQuery(t, q));
  const open = firstPerSeries(hits.filter(isOpen).sort((a, b) => {
    const ka = dueDayKey(a.dueDate) || '9999';
    const kb = dueDayKey(b.dueDate) || '9999';
    return ka === kb ? compareWithinDay(a, b) : (ka < kb ? -1 : 1);
  }));
  const done = hits.filter(isDone).sort((a, b) => doneStamp(b) - doneStamp(a));
  return { open, done };
}

/** Every tag in the corpus, most used first (for the pin picker). */
export function tagCounts(tasks) {
  const counts = new Map();
  for (const task of tasks || []) {
    for (const tag of task?.tags || []) {
      const t = normalizeTag(String(tag));
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/* ---------- words for the right-hand side of a row ---------- */

/** A due time as a row says it: "9am", "2:30pm". Empty for a date-only due date. */
export function clockLabel(value) {
  if (!hasDueTime(value)) return '';
  const d = new Date(value);
  const mins = d.getMinutes();
  const hours = d.getHours();
  const h12 = hours % 12 || 12;
  const suffix = hours < 12 ? 'am' : 'pm';
  return mins ? `${h12}:${String(mins).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/**
 * What a row says about its date, in the view it is shown in:
 *   { text: '2 days late', late: true }  overdue
 *   { text: '9am' }                      today, timed
 *   { text: '' }                         today, untimed (the section says today)
 *   { text: 'tomorrow' | 'tomorrow 9am' | 'Fri' | 'Mon 6 Oct' } otherwise
 *
 * `context` = 'day' when the row already sits under its own day's heading
 * (Upcoming), where only the time is worth saying; 'any' where nothing around
 * the row says which day it is (Search), so today is "today".
 */
export function whenLabel(task, now = new Date(), context = 'list') {
  if (!task?.dueDate) return { text: '' };
  const day = dueDayStart(task.dueDate);
  if (!day) return { text: '' };
  const clock = clockLabel(task.dueDate);
  const diff = differenceInCalendarDays(day, now);

  if (isOpen(task) && diff < 0) {
    const n = -diff;
    return { text: n === 1 ? '1 day late' : `${n} days late`, late: true };
  }
  const joined = (word) => (clock ? `${word} ${clock}` : word);
  if (context === 'any' && diff === 0) return { text: joined('today') };
  if (context === 'day' || diff === 0) return { text: clock };
  if (diff === 1) return { text: joined('tomorrow') };
  if (diff > 1 && diff < 7) return { text: joined(format(day, 'EEE')) };
  return { text: joined(format(day, 'EEE d MMM')) };
}

/* ---------- small helpers the pages share ---------- */

/** Settling rows are shown where they were, drawn crossed, until they leave. */
export function withSettling(tasks, settling) {
  if (!settling?.size) return tasks;
  return tasks.map((t) => (settling.has(taskId(t)) && isDone(t) ? { ...t, status: 'pending', __real: t } : t));
}

/**
 * The due date a task should carry on `targetKey` (`yyyy-MM-dd`): a date-only
 * task stays date-only; a timed one keeps its clock time on the new day.
 */
export function dueDateOn(task, targetKey) {
  if (!targetKey) return null;
  if (!hasDueTime(task?.dueDate)) return targetKey;
  const old = new Date(task.dueDate);
  const [y, m, d] = targetKey.split('-').map(Number);
  return new Date(y, m - 1, d, old.getHours(), old.getMinutes(), 0, 0).toISOString();
}

export function dayTitle(date, now) {
  const diff = differenceInCalendarDays(now, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return format(date, date.getFullYear() === now.getFullYear() ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy');
}

/** The first `limit` rows, cut on whole rows, keeping their day groups. */
export function limitGroups(groups, limit) {
  const out = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push(g.tasks.length <= left ? g : { ...g, tasks: g.tasks.slice(0, left) });
    left -= g.tasks.length;
  }
  return out;
}

/** The quick answers in the pick-a-date sheet. */
export function quickDates(now = new Date()) {
  const saturday = addDays(now, (6 - now.getDay() + 7) % 7 || 7);
  return [
    { key: localDateString(now), label: 'Today' },
    { key: localDateString(addDays(now, 1)), label: 'Tomorrow' },
    { key: localDateString(saturday), label: `Weekend · ${format(saturday, 'EEE d')}` },
    { key: localDateString(nextMonday(now)), label: `Next week · ${format(nextMonday(now), 'EEE d')}` },
  ];
}
