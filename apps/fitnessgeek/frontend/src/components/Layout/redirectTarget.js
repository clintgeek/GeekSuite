/**
 * Where an old address lands: `to`, keeping the query string (and hash) the
 * link came with, plus any `params` the new page needs — so
 * `/food-log?date=2026-11-20&meal=dinner` opens that dinner on Today, and
 * `/reports` opens Trends on its Food tab (DOCS/ONE_APP_PLAN.md §1, §3).
 * `params` win over a same-named key in the old link.
 */
export function redirectTarget(to, { search = '', hash = '' } = {}, params = {}) {
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const text = query.toString();
  return `${to}${text ? `?${text}` : ''}${hash || ''}`;
}
