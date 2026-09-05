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

export default api;
