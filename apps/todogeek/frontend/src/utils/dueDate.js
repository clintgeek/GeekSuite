import { localDateString, utcDateString } from '@geeksuite/utils';

/**
 * dueDate.js — the one place that knows what a todogeek `dueDate` means.
 *
 * ## Why this file exists
 *
 * `packages/utils/src/dates.js` splits every date in the suite into two
 * families: a **calendar date** (no time of day, stored as UTC midnight, read
 * with UTC accessors) and an **instant** (a real moment, read locally).
 * TodoGeek's `Task.dueDate` is the one field in the suite that is *both*,
 * and the gateway says so out loud:
 *
 *   > "`Task.dueDate` is unusual: it is BOTH, depending on the task. A task
 *   > with no particular hour is a calendar date; a task with a reminder time
 *   > needs that hour preserved."
 *   > — `graphql/todogeek/validation.js`
 *
 * The server's test for which one it is holding is exactly
 * `reminderService.hasDueTime`: **UTC midnight means date-only, anything else
 * carries a due time.** That is not a heuristic, it is the rule the reminder
 * scheduler already runs on — a UTC-midnight task never gets a push, because
 * there is no hour to push at.
 *
 * The client had no such test. Every read site used *local* accessors —
 * `differenceInCalendarDays(due, now)`, `format(due, 'yyyy-MM-dd')`,
 * `due.getHours()`, `isToday(due)`, `localDateString(due)` — which is right
 * for the timed half and one day early for the date-only half anywhere west
 * of UTC. A task Review filed for "today" (Review sends a bare `yyyy-MM-dd`,
 * which the Date scalar parses to UTC midnight) came back reading `-1` day:
 * an amber "yesterday" badge on Today, the Overdue group on Tags, the
 * previous cell in the month grid, and a phantom "7:00 PM" wherever the row
 * showed a time.
 *
 * BURN_REVIEW #8 fixed the opposite half of this — a 9pm task was grouping
 * under tomorrow's UTC day — by moving `TaskList` to `localDateString`. That
 * fix is correct and is preserved here: a due date that carries a time is
 * still read locally. What is added is the other branch.
 *
 * ## Using it
 *
 * - `hasDueTime(v)` — does this due date carry an hour? (`v` may be the task;
 *   its `hasDueTime` flag wins — contract C2)
 * - `dueDayKey(v)` — `yyyy-MM-dd` for the day it lands on, for grouping
 * - `dueDayStart(v)` — a **local** midnight `Date` for that same day, so
 *   date-fns' local-calendar helpers (`differenceInCalendarDays`,
 *   `isWithinInterval`, `isToday`, `format`) give the answer the user sees
 *
 * None of these are for `createdAt` / `completedAt` / `blockedAt` — those are
 * plain instants with no second nature, and `localDateString` /
 * `differenceInCalendarDays` on the raw value is already right for them.
 */

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Every helper here takes either a bare due date (the legacy reading) or a
 * TASK — `{ dueDate, hasDueTime }` — whose explicit flag wins (contract C2,
 * 2026-11-15). Pass the task wherever you have one: the bare-value reading
 * cannot tell 6 pm US-Central (exactly UTC midnight) from "no time".
 */
const isTaskLike = (value) => (
  value !== null && typeof value === 'object' && !(value instanceof Date) && 'dueDate' in value
);
const split = (value) => (isTaskLike(value)
  ? { raw: value.dueDate, flag: typeof value.hasDueTime === 'boolean' ? value.hasDueTime : undefined }
  : { raw: value, flag: undefined });

/** The legacy rule: anything but exactly UTC midnight carries a time. */
const notUtcMidnight = (d) => (
  d.getUTCHours() !== 0 ||
  d.getUTCMinutes() !== 0 ||
  d.getUTCSeconds() !== 0 ||
  d.getUTCMilliseconds() !== 0
);

/**
 * True when this due date carries a time of day.
 *
 * Given a task with a boolean `hasDueTime`, that flag. Otherwise the legacy
 * rule, character-for-character the gateway's `reminderService.hasDueTime`:
 * UTC midnight is date-only. (Local 09:00 in a UTC+9 zone *is* UTC midnight —
 * and so is 6 pm US-Central, which is why the flag exists.)
 *
 * @param {string|Date|number|{dueDate, hasDueTime}|null|undefined} value
 * @returns {boolean} false for a missing or unparseable value
 */
export function hasDueTime(value) {
  const { raw, flag } = split(value);
  const d = toDate(raw);
  if (!d) return false;
  if (flag !== undefined) return flag;
  return notUtcMidnight(d);
}

/**
 * `yyyy-MM-dd` for the day a due date belongs to, in the reader's terms.
 *
 * Date-only → the UTC day it names (the same day for everyone, which is what
 * "no particular hour" means). Timed → the local day the user experiences it
 * on, which is what BURN_REVIEW #8 established.
 *
 * @param {string|Date|number|{dueDate, hasDueTime}|null|undefined} value
 * @returns {string} `yyyy-MM-dd`, or `''` for a missing/unparseable value
 */
export function dueDayKey(value) {
  const d = toDate(split(value).raw);
  if (!d) return '';
  return hasDueTime(value) ? localDateString(d) : utcDateString(d);
}

/**
 * Local midnight of the day a due date belongs to.
 *
 * Everything in this app that compares or formats a due date goes through
 * date-fns, and every date-fns calendar helper reads *local* fields. Handing
 * them the raw value is what produces the off-by-one; handing them this is
 * what fixes it, with no change at all for a task that carries a time.
 *
 * @param {string|Date|number|{dueDate, hasDueTime}|null|undefined} value
 * @returns {Date|null} null for a missing/unparseable value
 */
export function dueDayStart(value) {
  const key = dueDayKey(value);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * A timed instant moved off EXACTLY UTC midnight by one second, so a reader
 * still on the legacy rule (an old tab, a gateway mid-deploy, a helper handed
 * the bare value) cannot mistake it for "no time". One second is the same
 * minute on every clock this app draws.
 */
export function avoidUtcMidnight(value) {
  const d = toDate(value);
  if (!d) return value;
  return notUtcMidnight(d) ? d : new Date(d.getTime() + 1000);
}

/**
 * A due-date value as a write sends it, with its flag (contract C2):
 *   null → `{ dueDate: null, hasDueTime: false }`
 *   'yyyy-MM-dd' → date-only
 *   anything else (an ISO instant, a Date) → timed, never on UTC midnight
 */
export function dueFields(value) {
  if (value === null || value === undefined || value === '') return { dueDate: null, hasDueTime: false };
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { dueDate: value, hasDueTime: false };
  const d = toDate(value);
  if (!d) return { dueDate: value };
  return { dueDate: avoidUtcMidnight(d).toISOString(), hasDueTime: true };
}

/**
 * A task as the client keeps it: a TIMED task whose stored instant is exactly
 * UTC midnight (6 pm US-Central) gets that one second, so every reader —
 * including the ones still handed a bare `task.dueDate` — sees a time. The
 * same object back when nothing needed changing.
 */
export function withExplicitTime(task) {
  if (!task || task.hasDueTime !== true || !task.dueDate) return task;
  const d = toDate(task.dueDate);
  if (!d || notUtcMidnight(d)) return task;
  return { ...task, dueDate: avoidUtcMidnight(d).toISOString() };
}
