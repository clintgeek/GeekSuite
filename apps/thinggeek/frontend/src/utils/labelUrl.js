/**
 * Printable QR box labels — the URL a phone camera opens straight into
 * ThingGeek, and the `/labels?ids=...` query string that picks what to
 * print (DOCS/THINGGEEK_PLAN.md; approved 2026-09-29).
 *
 * PRIVACY: the QR payload is the URL and nothing else — no name, no
 * identifier, no value. Opening it still goes through login and the member
 * gate exactly like any other deep link; the sticker itself carries no
 * secret.
 */

/** Trim any trailing slash so `${origin}${path}` never doubles one up. */
function cleanOrigin(origin) {
  return String(origin || '').replace(/\/+$/, '');
}

/**
 * The absolute URL to encode in a thing's QR label. Built from the given
 * origin (default `window.location.origin`) so the same build works on any
 * host — never a hardcoded domain.
 */
export function thingLabelUrl(id, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  return `${cleanOrigin(origin)}/thing/${encodeURIComponent(String(id ?? ''))}`;
}

/**
 * `?ids=<id>,<id>,...` → the ids, in first-seen order, deduped, with blank
 * or whitespace-only entries dropped. Accepts a search string, a
 * `URLSearchParams`, or a bare `ids=...` fragment — anything
 * `URLSearchParams` itself accepts.
 */
export function parseLabelIds(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const raw = params.get('ids') || '';
  const seen = new Set();
  const ids = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * The `/labels` path for a set of thing ids — where a "Print label" action
 * should link. A single id is fine: `labelsPath('t-1')` === `labelsPath(['t-1'])`.
 */
export function labelsPath(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => String(id ?? '').trim()).filter(Boolean);
  return `/labels?ids=${list.map(encodeURIComponent).join(',')}`;
}
