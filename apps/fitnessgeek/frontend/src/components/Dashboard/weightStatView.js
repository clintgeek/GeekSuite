const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-09-29' → 'Sep 29' (a calendar date; no Date parsing, no timezone). */
const shortDay = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : null;
};

/**
 * The Weight stat, from getWeightStats' smoothed change (plan §0): a 7-day
 * mean vs the 7-day mean ~30 days earlier, or — when that can't be computed
 * honestly — no number, and a line saying why or when.
 */
export function weightStatView(stats) {
  const change = typeof stats?.totalChange === 'number' && Number.isFinite(stats.totalChange) ? stats.totalChange : null;
  if (change !== null) {
    const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
    return { value: `${sign}${Math.abs(change).toFixed(1)}`, unit: 'lb', caption: '7-day avg vs 30 days ago' };
  }
  if (stats?.reason === 'insufficient_span') {
    const when = shortDay(stats.availableFrom);
    return { value: '--', unit: '', caption: when ? `30-day trend from ${when}` : 'Needs 30 days of weigh-ins' };
  }
  if (stats?.reason === 'no_baseline') {
    return { value: '--', unit: '', caption: 'No weigh-ins around 30 days ago' };
  }
  return { value: '--', unit: '', caption: stats?.reason === 'no_data' ? 'No weigh-ins yet' : '' };
}

