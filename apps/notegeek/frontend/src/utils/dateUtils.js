/**
 * Format a date as a human-readable relative time string.
 * e.g. "just now", "5m ago", "3h ago", "2d ago", "1w ago", "Jan 15"
 *
 * @param {string|Date} date - The date to format
 * @returns {string} A relative time string
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
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
