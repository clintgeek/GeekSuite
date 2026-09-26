/**
 * Calendar-date helpers.
 *
 * A session's `playedOn` and a playthrough's start/finish are CALENDAR days,
 * stored as UTC midnight (the suite convention — @geeksuite/utils/dates is
 * server-side). So a day the user picks in their own timezone is sent as
 * `YYYY-MM-DDT00:00:00.000Z`, and one read back is formatted in UTC. Reading a
 * UTC-midnight date locally is how BookGeek showed books finished on the 1st
 * as finished the month before.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Today's LOCAL calendar date as `YYYY-MM-DD` (the value an <input type="date"> wants). */
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
  return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function yearOf(game) {
  if (game?.releaseYear) return game.releaseYear;
  if (!game?.releaseDate) return null;
  const d = new Date(game.releaseDate);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/** "Today", "Yesterday", "3 days ago", else a date. For a UTC calendar day. */
export function relativeDay(value, now = new Date()) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return formatCalendarDate(value, { month: 'short', day: 'numeric', year: d.getUTCFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/**
 * "Today", "Yesterday", "3 days ago", else a date — for an INSTANT (an import
 * time, a last-played timestamp), read in the viewer's own timezone.
 *
 * relativeDay() above is for calendar days stored as UTC midnight and must
 * not be used here: after 7 PM in Chicago an instant's UTC date is already
 * tomorrow, so an import from five minutes ago read as "Sep 26" (2026-09-25,
 * caught by CI running in the evening).
 */
export function relativeInstant(value, now = new Date()) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const localDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((localDay(now) - localDay(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** Minutes → "1h 30m", "45m", "2h". */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Hours → "12.5 h" / "1 h" / "40 min". */
export function formatHours(hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return '';
  if (h < 1) return `${Math.round(h * 60)} min`;
  const rounded = h >= 100 ? Math.round(h) : Math.round(h * 10) / 10;
  return `${rounded} h`;
}
