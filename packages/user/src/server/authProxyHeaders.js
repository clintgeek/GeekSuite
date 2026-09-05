'use strict';

/**
 * authProxyHeaders — the headers a consumer backend replays when it proxies a
 * browser's auth call up to basegeek.
 *
 * ## Why this exists
 *
 * Six backends (notegeek, bujogeek, fitnessgeek, storygeek, flockgeek,
 * bookgeek) expose `POST /api/auth/refresh` and `POST /api/auth/logout` as
 * thin proxies: the browser calls its own app's backend, the backend replays
 * the browser's `Cookie` (and `Authorization`) header to
 * `basegeek/api/auth/{refresh,logout}`, and hands the `Set-Cookie` back down.
 *
 * basegeek now also runs a double-submit CSRF token
 * (`apps/basegeek/packages/api/src/middleware/csrfToken.js`): a
 * cookie-authenticated mutation must carry `X-CSRF-Token` matching the
 * `geek_csrf` cookie. Each proxy hand-built its own header object and every
 * one of them forwarded the cookie but *not* the token. That is invisible
 * while `CSRF_TOKEN=report`, and fatal the moment it is `enforce`: every
 * refresh 403s, `@geeksuite/auth` reads 403 as session-expired, and the whole
 * suite logs out within the hour of the flip.
 *
 * One helper, six callers, one test — so the next proxy that gets written
 * cannot forget a header the one next to it remembers.
 *
 * ## The rule: forward, never fabricate
 *
 * This returns only what the *incoming request actually carried*. It will not
 * read `geek_csrf` out of the cookie jar and synthesize a matching header —
 * doing so would hand every proxied path a permanent, automatic pass through
 * basegeek's double-submit check, which is exactly the check the suite is
 * about to start enforcing. A browser that sends no token gets no token
 * forwarded, and basegeek decides what that means.
 *
 * Empty header values are dropped rather than forwarded as `''`: an empty
 * `Authorization` is noise upstream, and an empty `X-CSRF-Token` reads to the
 * guard as "header present but blank", which is a mismatch rather than a
 * missing header.
 *
 * @example
 *   const { authProxyHeaders } = require('@geeksuite/user/server/authProxyHeaders');
 *   await axios.post(`${BASEGEEK_URL}/api/auth/refresh`, payload, {
 *     headers: authProxyHeaders(req),
 *   });
 */

/** The header basegeek's double-submit guard reads, as sent on the wire. */
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** Its lowercase form, which is how Node/Express keys `req.headers`. */
const CSRF_HEADER_KEY = 'x-csrf-token';

/**
 * Read one request header as a trimmed non-empty string.
 *
 * Node hands back an array when a header arrives more than once. For the ones
 * we forward, the first value is the only sane reading — a request with two
 * different CSRF tokens is not one we want to "helpfully" merge.
 *
 * @param {object} req Express request (or anything with `.headers`).
 * @param {string} key Lowercase header name.
 * @returns {string|null}
 */
function readHeader(req, key) {
  const raw = req?.headers?.[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * The CSRF token the browser presented, or null.
 *
 * Exported on its own because a couple of proxies want to log or assert on it
 * without building the whole header set.
 *
 * @param {object} req Express request.
 * @returns {string|null}
 */
function readCsrfHeader(req) {
  return readHeader(req, CSRF_HEADER_KEY);
}

/**
 * Build the header set for a server-to-server call that replays a browser's
 * session to basegeek.
 *
 * Includes, only when the incoming request carried a non-empty value:
 *   - `Cookie`        — the SSO cookies basegeek authenticates by
 *   - `Authorization` — the bearer token, for the bearer-first callers
 *   - `X-CSRF-Token`  — the double-submit token matching `geek_csrf`
 *
 * Note there is no `Origin` or `Referer` here, and there should not be: this
 * is a non-browser call, and `csrfGuard`'s documented step 4 lets an
 * originless request through precisely so the suite's own proxies work. The
 * token is what basegeek checks on this path.
 *
 * @param {object} req Express request being proxied.
 * @param {object} [options]
 * @param {boolean} [options.cookie=true] Forward `Cookie`. Pass `false` on an
 *   unauthenticated entry point (login/register): replaying the caller's
 *   session there turns a credential exchange into a cookie-authenticated
 *   mutation, which is both pointless and CSRF-checked.
 * @param {boolean} [options.authorization=true] Forward `Authorization`.
 * @param {object} [options.extra] Headers to merge in last, overriding the
 *   forwarded ones — e.g. a bearer token the proxy resolved itself.
 * @returns {Record<string, string>} A plain header object, safe to spread.
 */
function authProxyHeaders(req, options = {}) {
  const {
    cookie = true,
    authorization = true,
    extra = null,
  } = options;

  const headers = {};

  if (cookie) {
    const value = readHeader(req, 'cookie');
    if (value) headers.Cookie = value;
  }

  if (authorization) {
    const value = readHeader(req, 'authorization');
    if (value) headers.Authorization = value;
  }

  const csrf = readCsrfHeader(req);
  if (csrf) headers[CSRF_HEADER_NAME] = csrf;

  if (extra && typeof extra === 'object') {
    for (const [name, value] of Object.entries(extra)) {
      if (value === undefined || value === null || value === '') continue;
      headers[name] = value;
    }
  }

  return headers;
}

module.exports = {
  authProxyHeaders,
  readCsrfHeader,
  CSRF_HEADER_NAME,
  CSRF_HEADER_KEY,
};
