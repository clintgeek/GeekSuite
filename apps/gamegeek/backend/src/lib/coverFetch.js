/**
 * Outbound cover fetching — the one place this API reaches the public
 * internet for image bytes, and therefore the one place that needs a leash.
 *
 * Ported from apps/bookgeek/api/src/coverFetch.js (2026-09-05 SSRF /
 * unbounded-download going-over, BURN_REVIEW_2 #9 redirect hardening) with
 * one generalization: the host allow-list is a caller-supplied parameter
 * instead of a module constant, since GameGeek's cover hosts (IGDB, Steam's
 * several CDNs) differ from BookGeek's. GameGeek's list lives in
 * `src/metadata/coverHosts.js`. DOCS/GameGeekPlan.md §8.2 notes this will
 * later move into a shared `@geeksuite/collection` package; until then it is
 * duplicated deliberately, not accidentally.
 *
 * The four hardenings this file exists for:
 *   1. A host allow-list, checked before the socket opens.
 *   2. A hard timeout (`AbortSignal`-driven), so a hung upstream can't hold
 *      an Express handler and its socket open indefinitely.
 *   3. A size cap, checked against the declared Content-Length AND the real
 *      body length (a lying header doesn't get a free pass).
 *   4. Redirects followed manually and capped, with every hop re-validated
 *      against the same allow-list — `redirect: "follow"` checks the
 *      allow-list once, on the URL the caller supplied, then lets Node chase
 *      up to twenty further hops with nobody looking.
 */

export const OUTBOUND_TIMEOUT_MS = 15000;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** How many `Location:` hops a cover fetch may follow before giving up. */
export const MAX_COVER_REDIRECTS = 3;

/**
 * @param {string} rawUrl
 * @param {string[]} allowedHosts exact hostnames, not suffixes.
 */
export function isAllowedCoverHost(rawUrl, allowedHosts) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  return Array.isArray(allowedHosts) && allowedHosts.includes(host);
}

/**
 * Fetch an image with a deadline and a hard size cap. Returns a Buffer, or
 * null when the upstream failed, answered empty, was too large, or the URL
 * (or a redirect hop) was off the allow-list. Never throws — callers all
 * treat null as "no cover".
 *
 * @param {string} url
 * @param {object} options
 * @param {string[]} options.allowedHosts required — the caller's host allow-list.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.logger] pino-style logger; defaults to console.
 */
export async function fetchImageBuffer(url, { allowedHosts, fetchImpl = fetch, logger = console } = {}) {
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    throw new TypeError('fetchImageBuffer: allowedHosts is required');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
  try {
    let current = String(url ?? '');
    if (!isAllowedCoverHost(current, allowedHosts)) {
      logger.warn?.('cover image download refused: host not allowed', { host: hostOf(current) });
      return null;
    }

    for (let hop = 0; hop <= MAX_COVER_REDIRECTS; hop += 1) {
      const res = await fetchImpl(current, {
        signal: controller.signal,
        redirect: 'manual',
      });

      if (!isRedirectStatus(res?.status)) {
        if (!res.ok) return null;

        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > MAX_COVER_BYTES) return null;

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength === 0) return null;
        if (arrayBuffer.byteLength > MAX_COVER_BYTES) return null;
        return Buffer.from(arrayBuffer);
      }

      if (hop === MAX_COVER_REDIRECTS) {
        logger.warn?.('cover image download refused: too many redirects', {
          host: hostOf(current),
          max: MAX_COVER_REDIRECTS,
        });
        return null;
      }

      const location = res.headers.get('location');
      if (!location) return null;

      let next;
      try {
        next = new URL(String(location), current).toString();
      } catch {
        return null;
      }
      if (!isAllowedCoverHost(next, allowedHosts)) {
        logger.warn?.('cover image download refused: redirect off the allow-list', {
          from: hostOf(current),
          to: hostOf(next),
        });
        return null;
      }
      current = next;
    }

    return null;
  } catch (err) {
    logger.warn?.('cover image download failed', { error: err?.message || String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Hostname for a log line, or "" when the value will not parse. */
function hostOf(rawUrl) {
  try {
    return new URL(String(rawUrl)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** The five statuses that carry a `Location:` worth following. */
function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export default {
  MAX_COVER_BYTES,
  MAX_COVER_REDIRECTS,
  OUTBOUND_TIMEOUT_MS,
  fetchImageBuffer,
  isAllowedCoverHost,
};
