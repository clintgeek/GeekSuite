/**
 * Convert a Date (or date string) to a local YYYY-MM-DD string.
 * Unlike .toISOString().split('T')[0], this respects the browser's timezone
 * so "today" stays "today" regardless of UTC offset.
 */
export function toLocalDateString(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA'); // en-CA locale outputs YYYY-MM-DD
}
