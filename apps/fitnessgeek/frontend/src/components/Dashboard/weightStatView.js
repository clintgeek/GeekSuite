const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-09-29' → 'Sep 29' (a calendar date; no Date parsing, no timezone). */
const shortDay = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : null;
};

/**
 * The Weight stat (plan §0). The VALUE is always the current 7-day average —
 * the card is "Weight", and a card that shows a change one day and a weight
 * the next makes the reader check which it is. The CAPTION carries the
 * 30-day change (7-day mean vs 7-day mean ~30 days earlier) when it can be
 * computed honestly, and otherwise says when it will be.
 */
export function weightStatView(stats) {
  const mean = typeof stats?.currentMean === 'number' && Number.isFinite(stats.currentMean) ? stats.currentMean : null;
  const change = typeof stats?.totalChange === 'number' && Number.isFinite(stats.totalChange) ? stats.totalChange : null;
  if (mean === null) {
    return { value: '--', unit: '', caption: stats?.reason === 'no_data' || !stats ? 'No weigh-ins yet' : '' };
  }
  const value = mean.toFixed(1);
  if (change !== null) {
    const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
    return { value, unit: 'lb', caption: `7-day avg · ${sign}${Math.abs(change).toFixed(1)} lb in 30 days` };
  }
  const when = shortDay(stats?.availableFrom);
  return { value, unit: 'lb', caption: `7-day avg · 30-day change from ${when || 'after 30 days of weigh-ins'}` };
}
