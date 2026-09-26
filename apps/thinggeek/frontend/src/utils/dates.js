/**
 * Date helpers — two kinds of date, never mixed (GameGeek's utils/dates.js
 * rule, copied on purpose):
 *
 *   CALENDAR days (a warranty's end, an acquired date, a registration due)
 *   are stored as UTC midnight. A day picked locally is sent as
 *   `YYYY-MM-DDT00:00:00.000Z`, and one read back is formatted in UTC —
 *   reading a UTC-midnight date locally is how BookGeek showed books
 *   finished on the 1st as finished the month before.
 *
 *   INSTANTS (createdAt, deletedAt) are read in the viewer's own timezone.
 *   After 7 PM in Chicago an instant's UTC date is already tomorrow.
 */

const pad = (n) => String(n).padStart(2, '0');
const DAY = 86400000;

/** Today's LOCAL calendar date as `YYYY-MM-DD` (what an <input type="date"> wants). */
export function todayInputValue(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00.000Z`. Null for anything that is not a date. */
export function calendarDateToUtcIso(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** A stored UTC-midnight date → `YYYY-MM-DD` for an input. */
export function utcIsoToInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "Sep 24, 2026" for a calendar date, read in UTC. */
export function formatCalendarDate(value, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

/** The calendar year of a UTC-midnight date. */
export function calendarYear(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/**
 * "Today", "Yesterday", "3 days ago", else a date — for an INSTANT, read in
 * the viewer's own timezone. Never for a UTC-midnight calendar day.
 */
export function relativeInstant(value, now = new Date()) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const localDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((localDay(now) - localDay(d)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * How a due date reads, from the server's whole-day `daysUntil` (UTC
 * calendar, negative when past). The server did the date maths; this only
 * words it.
 */
export function dueText(daysUntil) {
  if (!Number.isFinite(daysUntil)) return '';
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due tomorrow';
  if (daysUntil === -1) return 'Overdue by a day';
  if (daysUntil < 0) return `Overdue by ${-daysUntil} days`;
  if (daysUntil < 60) return `Due in ${daysUntil} days`;
  const months = Math.round(daysUntil / 30.44);
  if (months < 24) return `Due in ${months} months`;
  return `Due in ${Math.round(daysUntil / 365.25)} years`;
}

/**
 * When a dated thing is actually due: `occursOn` — for a recurring date the
 * next occurrence on/after today (the gateway computes it), for a one-off the
 * date itself. `date` is only the stored anchor, for the edit form.
 */
export const dueDateOf = (d) => d?.occursOn ?? d?.date ?? null;

/** The timeline's short form: "3 days overdue", "Today", "in 12 days", "in 5 months". */
export function relativeDay(daysUntil) {
  if (!Number.isFinite(daysUntil)) return '';
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil === -1) return '1 day overdue';
  if (daysUntil < 0) return `${-daysUntil} days overdue`;
  return dueText(daysUntil).replace(/^Due /, '');
}

/** "Every 12 months" / "Every year" / "Every 2 years". */
export function recurText(months) {
  const m = Number(months);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m === 1) return 'Every month';
  if (m === 12) return 'Every year';
  if (m % 12 === 0) return `Every ${m / 12} years`;
  return `Every ${m} months`;
}

/**
 * Whole days left before Trash purges a thing: `trashDays` after its
 * deletedAt INSTANT. Never below 0.
 */
export function daysUntilPurge(deletedAt, trashDays = 30, now = new Date()) {
  const d = new Date(deletedAt);
  if (!deletedAt || Number.isNaN(d.getTime())) return trashDays;
  const left = Math.ceil((d.getTime() + trashDays * DAY - now.getTime()) / DAY);
  return Math.max(0, Math.min(trashDays, left));
}
