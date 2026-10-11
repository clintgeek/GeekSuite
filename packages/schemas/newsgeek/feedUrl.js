/**
 * newsgeek feed URL identity — ONE function, used by the gateway's
 * DUPLICATE_FEED check and by the backend's discovery (`existingSourceId`),
 * so "already here" means the same thing in both (DOCS/NEWSGEEK_PLAN.md
 * "Reader-added sources": one poll per feed).
 *
 * Normalized: lower-case scheme and host (the URL parser does both), default
 * port dropped, no fragment (never part of the result), no trailing slash on the path. Also: http and
 * https are the same feed (the scheme is folded to https) — two readers
 * pasting either spelling must not make two polls of one feed. Path case and
 * the query are kept: they can be meaningful. Not a URL → null.
 */
function normalizeFeedUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname.replace(/\/+$/, '');
  const port = u.port ? `:${u.port}` : '';
  return `https://${u.hostname}${port}${path}${u.search}`;
}

/** True when two feed URLs name the same feed. */
function sameFeedUrl(a, b) {
  const na = normalizeFeedUrl(a);
  return na != null && na === normalizeFeedUrl(b);
}

module.exports = { normalizeFeedUrl, sameFeedUrl };
