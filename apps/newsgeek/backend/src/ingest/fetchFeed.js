/**
 * One polite HTTP GET for one feed: conditional (ETag / If-Modified-Since),
 * an honest User-Agent, a timeout, and a body cap. `fetchImpl` is injectable
 * so tests never touch the network.
 */

export const USER_AGENT = 'NewsGeek/1.0 (+https://newsgeek.clintgeek.com)';
export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // the Arkansas Advocate feed is 1.4 MB

const ACCEPT = {
  rss: 'application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.5',
  atom: 'application/atom+xml, application/rss+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.5',
  nws: 'application/geo+json',
};

export class FetchError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number|null, retryAfterMs?: number|null }} [info]
   */
  constructor(message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After: delta-seconds or an HTTP date. Null when absent/garbage. */
export function parseRetryAfter(value, now = new Date()) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - now.getTime());
}

function charsetOf(contentType, head) {
  const m = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType || '');
  if (m) return m[1];
  const x = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head);
  return x ? x[1] : 'utf-8';
}

function decode(buf, contentType) {
  const head = buf.subarray(0, 200).toString('latin1');
  const label = charsetOf(contentType, head);
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    throw new FetchError(`body too large (${declared} bytes > ${maxBytes})`, { status: res.status });
  }
  if (!res.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new FetchError(`body too large (> ${maxBytes} bytes)`, { status: res.status });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * @param {{ url: string, format?: string, etag?: string|null, lastModified?: string|null }} feed
 * @param {object} [opts]
 * @returns {Promise<{ status: number, notModified: boolean, body: string|null, etag: string|null, lastModified: string|null }>}
 * @throws {FetchError} on a non-2xx/304 answer, a timeout, a network error or an oversized body
 */
export async function fetchFeed(feed, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => new Date(),
} = {}) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: ACCEPT[feed.format] || ACCEPT.rss,
  };
  if (feed.etag) headers['If-None-Match'] = feed.etag;
  if (feed.lastModified) headers['If-Modified-Since'] = feed.lastModified;

  let res;
  try {
    res = await fetchImpl(feed.url, { method: 'GET', headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const cause = err?.cause?.code || err?.code;
    throw new FetchError(timedOut ? `timeout after ${timeoutMs} ms` : `network error${cause ? ` (${cause})` : ''}`);
  }

  const etag = res.headers.get('etag');
  const lastModified = res.headers.get('last-modified');

  if (res.status === 304) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return { status: 304, notModified: true, body: null, etag, lastModified };
  }
  if (res.status < 200 || res.status >= 300) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    const retryAfterMs = (res.status === 429 || res.status === 503)
      ? parseRetryAfter(res.headers.get('retry-after'), now())
      : null;
    throw new FetchError(`HTTP ${res.status}`, { status: res.status, retryAfterMs });
  }

  const buf = await readCapped(res, maxBytes);
  return { status: res.status, notModified: false, body: decode(buf, res.headers.get('content-type')), etag, lastModified };
}

export default { fetchFeed, parseRetryAfter, FetchError, USER_AGENT };
