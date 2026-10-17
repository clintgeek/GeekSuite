/**
 * Dates in words, one way across the app (UX review U-5, style sheet rule 10).
 *
 * - "Today" / "Yesterday" / "Thursday" for the last week (`nearDay`).
 * - "Oct 13" otherwise, with the year only when it isn't this year (`shortDay`).
 * - Ranges as "Oct 10–16" (`dayRange`). No zero padding, never ISO.
 * - Clock times as "8:30 AM" (`clockTime`), never "08:30 AM".
 *
 * A value is a calendar day ("2026-10-13", or a UTC-midnight instant such as
 * a stored `log_date`, "2026-10-13T00:00:00.000Z") or an instant (a Date, or
 * any other ISO string), which is read in the viewer's own zone. `today` is
 * a local YYYY-MM-DD (useToday()); it defaults to the device's today.
 */

// A fixed table rather than `toLocaleDateString(..., { month: 'short' })`:
// newer ICU builds say "Sept", older ones "Sep" (see bodyCompFormat.js).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_DASH = '–';

const CALENDAR = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

/** { y, m (1-12), d } for a calendar day or an instant, or null. */
function partsOf(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const match = CALENDAR.exec(value);
    if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

const noon = ({ y, m, d }) => new Date(y, m - 1, d, 12);

function localToday() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

const todayParts = (today) => partsOf(today) || localToday();

/** "Oct 13", or "Oct 13, 2025" when it isn't this year. '' for nothing. */
export function shortDay(value, today, { withYear = false } = {}) {
  const p = partsOf(value);
  if (!p) return '';
  const t = todayParts(today);
  const year = withYear || p.y !== t.y;
  return `${MONTHS[p.m - 1]} ${p.d}${year ? `, ${p.y}` : ''}`;
}

/** Whole days from `value` back to `today`: 1 is yesterday, -1 tomorrow. */
export function daysAgo(value, today) {
  const p = partsOf(value);
  if (!p) return null;
  return Math.round((noon(todayParts(today)) - noon(p)) / 86400000);
}

/** "Today", "Yesterday", "Tomorrow", "Thursday" (2–6 days back), else "Oct 13". */
export function nearDay(value, today) {
  const p = partsOf(value);
  if (!p) return '';
  const back = daysAgo(value, today);
  if (back === 0) return 'Today';
  if (back === 1) return 'Yesterday';
  if (back === -1) return 'Tomorrow';
  if (back > 1 && back < 7) return WEEKDAYS[noon(p).getDay()];
  return shortDay(value, today);
}

/** "Thu, Oct 13" — a weekday with the date, for a list row or a chart tooltip. */
export function weekdayDay(value, today) {
  const p = partsOf(value);
  if (!p) return '';
  return `${WEEKDAYS[noon(p).getDay()].slice(0, 3)}, ${shortDay(value, today)}`;
}

/**
 * "Oct 10–16", "Sep 28 – Oct 4", "Dec 29, 2025 – Jan 4, 2026", or one day
 * ("Oct 16") when both ends are the same day.
 */
export function dayRange(from, to, today) {
  const a = partsOf(from);
  const b = partsOf(to);
  if (!a && !b) return '';
  if (!a || !b) return shortDay(a ? from : to, today);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return shortDay(from, today);
  const t = todayParts(today);
  if (a.y !== b.y || a.y !== t.y) {
    return `${shortDay(from, today, { withYear: true })} ${EN_DASH} ${shortDay(to, today, { withYear: true })}`;
  }
  if (a.m !== b.m) return `${shortDay(from, today)} ${EN_DASH} ${shortDay(to, today)}`;
  return `${MONTHS[a.m - 1]} ${a.d}${EN_DASH}${b.d}`;
}

/** "8:30 AM" for an instant, in the viewer's zone. '' for nothing. */
export function clockTime(value) {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
