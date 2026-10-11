/**
 * Feed discovery: POST /api/discover on NewsGeek's own backend
 * (DOCS/NEWSGEEK_PLAN.md "Reader-added sources" → Discovery).
 *
 *   request  { url }
 *   response { ok, site: { name, homepage }, feeds: [{ url, format, items, newest, sampleTitles }],
 *              paywall: { level, evidence }, suggest: { name, kind, sections, placeSlugs },
 *              existingSourceId, message }
 *
 * `discoverSource` resolves with that body whenever the backend answered it —
 * `ok:false` ("No feed found…") is an answer, not an error. Everything else
 * rejects with a DiscoverError whose `message` is fit to show a reader:
 *   - RATE_LIMITED (429 or code)    → a friendly "try again later";
 *   - a 4xx with a message (the SSRF guard's "That address isn't on the
 *     public internet.", a bad URL) → shown as returned;
 *   - no answer at all              → "couldn't reach NewsGeek";
 *   - a 5xx                         → "the feed finder hit a snag".
 */
import { newsApi } from '../bootstrapUser';

export const RATE_LIMITED_LINE = 'You’ve looked up a lot of sites this hour. Give it a little while and try again.';
export const OFFLINE_LINE = 'Couldn’t reach NewsGeek. Check your connection and try again.';
export const SNAG_LINE = 'The feed finder hit a snag. Try again in a moment.';

export class DiscoverError extends Error {
  constructor(message, { code = null, status = 0 } = {}) {
    super(message);
    this.name = 'DiscoverError';
    this.code = code;
    this.status = status;
  }
}

export function discoverErrorFrom(err) {
  if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return new DiscoverError('Cancelled.', { code: 'CANCELLED' });
  const res = err?.response;
  if (!res) return new DiscoverError(OFFLINE_LINE, { code: 'NETWORK' });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  const code = data.code ?? data.error?.code ?? null;
  const message = data.message ?? data.error?.message ?? (typeof data.error === 'string' ? data.error : null);
  if (res.status === 429 || code === 'RATE_LIMITED') return new DiscoverError(RATE_LIMITED_LINE, { code: 'RATE_LIMITED', status: res.status });
  if (res.status >= 400 && res.status < 500 && message) return new DiscoverError(message, { code, status: res.status });
  return new DiscoverError(SNAG_LINE, { code, status: res.status });
}

export async function discoverSource(url, { signal } = {}) {
  try {
    const res = await newsApi.post('/discover', { url }, { signal });
    return res.data;
  } catch (err) {
    throw discoverErrorFrom(err);
  }
}
