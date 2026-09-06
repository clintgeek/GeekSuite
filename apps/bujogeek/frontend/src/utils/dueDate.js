import { localDateString, utcDateString } from '@geeksuite/utils';

/**
 * dueDate.js — the one place that knows what a bujogeek `dueDate` means.
 *
 * ## Why this file exists
 *
 * `packages/utils/src/dates.js` splits every date in the suite into two
 * families: a **calendar date** (no time of day, stored as UTC midnight, read
 * with UTC accessors) and an **instant** (a real moment, read locally).
 * BuJoGeek's `Task.dueDate` is the one field in the suite that is *both*,
 * and the gateway says so out loud:
 *
 *   > "`Task.dueDate` is unusual: it is BOTH, depending on the task. A task
 *   > with no particular hour is a calendar date; a task with a reminder time
 *   > needs that hour preserved."
 *   > — `graphql/bujogeek/validation.js`
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
 * - `hasDueTime(v)` — does this due date carry an hour? (mirrors the gateway)
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
 * True when this due date carries a time of day.
 *
 * Character-for-character the gateway's `reminderService.hasDueTime`, so the
 * client and the reminder scheduler can never disagree about whether a task
 * has an hour. Note the consequence at the edge: local 09:00 in a UTC+9 zone
 * *is* UTC midnight, so both sides call it date-only and neither sends a
 * push — agreeing with the server is the point.
 *
 * @param {string|Date|number|null|undefined} value
 * @returns {boolean} false for a missing or unparseable value
 */
export function hasDueTime(value) {
  const d = toDate(value);
  if (!d) return false;
  return (
    d.getUTCHours() !== 0 ||
    d.getUTCMinutes() !== 0 ||
    d.getUTCSeconds() !== 0 ||
    d.getUTCMilliseconds() !== 0
  );
}

/**
 * `yyyy-MM-dd` for the day a due date belongs to, in the reader's terms.
 *
 * Date-only → the UTC day it names (the same day for everyone, which is what
 * "no particular hour" means). Timed → the local day the user experiences it
 * on, which is what BURN_REVIEW #8 established.
 *
 * @param {string|Date|number|null|undefined} value
 * @returns {string} `yyyy-MM-dd`, or `''` for a missing/unparseable value
 */
export function dueDayKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return hasDueTime(d) ? localDateString(d) : utcDateString(d);
}

/**
 * Local midnight of the day a due date belongs to.
 *
 * Everything in this app that compares or formats a due date goes through
 * date-fns, and every date-fns calendar helper reads *local* fields. Handing
 * them the raw value is what produces the off-by-one; handing them this is
 * what fixes it, with no change at all for a task that carries a time.
 *
 * @param {string|Date|number|null|undefined} value
 * @returns {Date|null} null for a missing/unparseable value
 */
export function dueDayStart(value) {
  const key = dueDayKey(value);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
