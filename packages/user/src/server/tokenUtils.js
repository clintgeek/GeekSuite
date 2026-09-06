'use strict';

const axios = require('axios');

const SSO_COOKIE = 'geek_token';
const DEFAULT_BASEGEEK_URL = 'https://basegeek.clintgeek.com';

/**
 * Extract the auth token from a request.
 *
 * **Header first, then cookie** — the docstring here used to claim the
 * opposite, which is worth stating plainly because the SSO design elsewhere
 * (`DOCS/CONTEXT.md`, `/api/users/me`) is described as "cookie-first". A
 * caller that presents an explicit `Authorization: Bearer` has said which
 * identity it means, so that wins; the cookie is the fallback for a plain
 * browser call. A stale bearer beating a fresh cookie costs one 401 and the
 * client's own refresh, which is why the order has never been worth changing
 * across six backends — but it is the order, and this comment now says so.
 */
function getTokenFromRequest(req, cookieName = SSO_COOKIE) {
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    return parseCookieValue(cookieHeader, cookieName);
  }

  return null;
}

function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
    if (key !== name) continue;
    const value = idx >= 0 ? trimmed.slice(idx + 1) : '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Normalize upstream BaseGeek user object so id fields are consistent.
 * Handles the three response shapes BaseGeek may return.
 */
function normalizeSsoUser(responseData) {
  const user = responseData?.data?.user || responseData?.user || responseData;
  if (!user) return null;

  const id = user._id || user.id || user.userId;
  return {
    ...user,
    _id: id,
    id,
    userId: id,
  };
}

/**
 * How long to wait on basegeek before giving up, in milliseconds.
 *
 * This call sits in front of *every authenticated request* in the six consumer
 * backends (`attachUser()` runs it per request, with no cache), and axios's
 * default timeout is `0` — wait forever. A basegeek that is hung rather than
 * down therefore parks every inbound request in every app until the socket
 * dies of its own accord, which on Linux is minutes, and the app runs out of
 * handlers long before that. A bounded wait turns "the suite stops answering"
 * into `attachUser()`'s existing 502 branch (`ECONNABORTED` carries no
 * `error.response`, so it is not mistaken for a 401).
 *
 * 8s is comfortably above a healthy `/api/users/me` (single-digit ms in the
 * container network) and below any sane upstream proxy read timeout.
 * `BASEGEEK_TIMEOUT_MS` overrides it; a non-positive or unparseable value
 * falls back to the default rather than restoring "wait forever".
 */
const DEFAULT_TIMEOUT_MS = 8000;

function resolveTimeoutMs(env = process.env) {
  const raw = Number(env.BASEGEEK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Validate a token against BaseGeek and return the normalized SSO user.
 *
 * @param {string} token
 * @param {string} [baseGeekUrl]
 * @param {object} [options]
 * @param {number} [options.timeoutMs] override the request timeout (tests).
 */
async function validateToken(token, baseGeekUrl, options = {}) {
  const url = (baseGeekUrl || process.env.BASEGEEK_URL || DEFAULT_BASEGEEK_URL).replace(/\/$/, '');
  const timeout = options.timeoutMs ?? resolveTimeoutMs();

  const response = await axios.get(`${url}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout,
  });

  return normalizeSsoUser(response.data);
}

module.exports = {
  getTokenFromRequest,
  normalizeSsoUser,
  validateToken,
  resolveTimeoutMs,
  DEFAULT_TIMEOUT_MS,
};
