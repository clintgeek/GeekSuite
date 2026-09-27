/**
 * A Date from whatever the gateway sent: an ISO string, epoch millis, or a
 * numeric string of epoch millis (a GraphQL `Date` scalar can serialize
 * either way). `new Date("1727366400000")` is Invalid Date, hence this.
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null}
 */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = typeof value === 'string' && /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date as a human-readable relative time string.
 * e.g. "just now", "5m ago", "3h ago", "2d ago", "1w ago", "Jan 15"
 *
 * @param {string|Date} date - The date to format
 * @param {Date} [now] - The reference instant (defaults to the wall clock;
 *   tests pass one so they do not measure the runner)
 * @returns {string} A relative time string
 */
export function formatRelativeTime(date, now = new Date()) {
  const then = toDate(date) || new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
