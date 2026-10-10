/**
 * Dates, Gazette-style. "Today" is America/Chicago (NEWS_TIMEZONE in
 * @geeksuite/schemas/newsgeek/constants) — never UTC, never the device's
 * zone: the FitnessGeek UTC-"today" landmine.
 */
export const NEWS_TIMEZONE = 'America/Chicago';

const toDate = (value) => (value instanceof Date ? value : new Date(value));

/** "Saturday, October 10, 2026" for the masthead, in America/Chicago. */
export function mastheadDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NEWS_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(toDate(now));
}

/** "Oct 10, 2026, 7:42 AM CDT": the absolute time behind every relative one. */
export function absoluteTime(value) {
  if (!value) return '';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NEWS_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

/** "just now", "12m ago", "2h ago", "3d ago", then a short date ("Sep 2"). */
export function relativeTime(value, now = new Date()) {
  if (!value) return '';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.round((toDate(now).getTime() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-US', { timeZone: NEWS_TIMEZONE, month: 'short', day: 'numeric' }).format(d);
}
