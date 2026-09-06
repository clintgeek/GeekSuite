import axios from 'axios';

/**
 * basegeek's own REST client. Every page that talks to `/api/*` imports this
 * instance (AuthContext, LoginPage, RegisterPage, UserGeekPage, the aiGeek
 * console), so it is the one place to attach the CSRF token for all of them.
 *
 * Note this instance is deliberately NOT run through `@geeksuite/auth`'s
 * `setupAxiosInterceptors` — basegeek is the SSO origin and has no token
 * refresh loop of its own to bolt on — which is exactly why the header is
 * wired up here rather than inherited.
 */
const api = axios.create({ baseURL: '/api', withCredentials: true });

/** Non-HttpOnly cookie basegeek issues alongside the SSO cookies. */
const CSRF_COOKIE_NAME = 'geek_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** Methods the server never checks — no point reading the cookie for them. */
const SAFE_METHODS = new Set(['get', 'head', 'options', 'trace']);

/**
 * Read `geek_csrf` out of document.cookie, fresh on every request: basegeek
 * rotates it with the refresh token, so a value cached at module load would go
 * stale within the hour.
 *
 * Duplicated from @geeksuite/auth's `csrfHeaders()` rather than imported —
 * this UI package does not depend on @geeksuite/auth, and a five-line cookie
 * read is a cheaper price than a new workspace dependency. If a third copy
 * ever appears, that is the signal to add the dependency instead.
 */
function csrfToken() {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie;
  if (typeof raw !== 'string' || !raw) return null;

  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    if (trimmed.slice(0, idx) !== CSRF_COOKIE_NAME) continue;
    const value = trimmed.slice(idx + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

// Double-submit CSRF token on every state-changing call. The server ships the
// check in report-only mode (CSRF_TOKEN=report), so a missing token costs a log
// line rather than a 403 — but basegeek's own UI should be the first client
// that is clean. See apps/basegeek/packages/api/src/middleware/csrfToken.js.
api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toLowerCase();
  if (SAFE_METHODS.has(method)) return config;

  const token = csrfToken();
  if (token && !config.headers?.[CSRF_HEADER_NAME]) {
    config.headers = config.headers || {};
    config.headers[CSRF_HEADER_NAME] = token;
  }
  return config;
});

// ── Self-heal a CSRF 403 (mirrors @geeksuite/auth's csrfHeal) ──────────────
//
// 2026-09-06 incident: with CSRF_TOKEN=enforce, a console tab running a bundle
// cached by the service worker from before this file grew the header could
// not log in at all — every POST /api/auth/login was rejected as
// `csrf_token_missing`, and the page just said "Authentication failed". A new
// bundle can heal a stale *cookie* (retry once with a freshly-read token); the
// only cure for a stale *bundle* is a reload, which is what the second step
// does, once per session, so the updated worker's bundle takes over.
export const CSRF_FAILURE_CODES = ['csrf_token_missing', 'csrf_token_invalid'];
export const CSRF_RELOAD_FLAG_KEY = 'basegeek:csrf-reload-attempted';

export function extractCsrfErrorCode(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.code === 'string') return data.code;
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error === 'object' && typeof data.error.code === 'string') return data.error.code;
  return null;
}

export function isCsrfFailure(status, data) {
  return status === 403 && CSRF_FAILURE_CODES.includes(extractCsrfErrorCode(data));
}

function setHeader(config, value) {
  const headers = config.headers;
  if (headers && typeof headers.set === 'function') {
    headers.delete?.(CSRF_HEADER_NAME);
    headers.set(CSRF_HEADER_NAME, value);
  } else {
    config.headers = { ...(headers || {}) };
    for (const key of Object.keys(config.headers)) {
      if (key.toLowerCase() === CSRF_HEADER_NAME.toLowerCase()) delete config.headers[key];
    }
    config.headers[CSRF_HEADER_NAME] = value;
  }
}

/** One reload per tab session; returns true when it reloaded. */
export function reloadOnceForCsrf({ storage = globalThis.sessionStorage, reload = () => window.location.reload() } = {}) {
  try {
    if (storage?.getItem(CSRF_RELOAD_FLAG_KEY)) return false;
    storage?.setItem(CSRF_RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // no storage → still reload once per page life via the in-memory flag below
    if (reloadOnceForCsrf._done) return false;
    reloadOnceForCsrf._done = true;
  }
  reload();
  return true;
}

export function installCsrfHeal(instance, { reloadOnce = reloadOnceForCsrf } = {}) {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const original = error?.config;
      const status = error?.response?.status;
      const data = error?.response?.data;
      if (!original || !isCsrfFailure(status, data)) return Promise.reject(error);

      if (!original._csrfHealRetried) {
        original._csrfHealRetried = true;
        const token = csrfToken();
        if (token) {
          setHeader(original, token);
          return instance(original);
        }
      }
      if (reloadOnce()) {
        // Hold the promise open: the page is going away.
        return new Promise(() => {});
      }
      return Promise.reject(error);
    }
  );
  return instance;
}

installCsrfHeal(api);

export default api;
