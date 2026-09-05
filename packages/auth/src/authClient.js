// Canonical cross-tab auth channel for the whole suite. Every app both posts
// and listens here; do not fork these values.
export const AUTH_CHANNEL = 'geeksuite-auth';
export const AUTH_LOGOUT = 'LOGOUT';

// Identifies this browsing context so a tab ignores the logout it sent itself.
// BroadcastChannel delivers to every other channel object of the same name,
// including ones in the same tab, so without this the sending tab runs its own
// logout handler a second time.
const TAB_ID = (() => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `tab-${ Date.now() }-${ Math.random().toString(36).slice(2) }`;
})();

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

const GEEK_TOKEN_KEY = 'geek_token';
const GEEK_REFRESH_TOKEN_KEY = 'geek_refresh_token';

/**
 * Double-submit CSRF token (basegeek, 2026-09-05).
 *
 * basegeek issues `geek_csrf` on `domain=.clintgeek.com` alongside the SSO
 * cookies, deliberately NOT HttpOnly, and rotates it with the refresh token.
 * Every state-changing call that authenticates by cookie has to echo the value
 * back in `X-CSRF-Token`. A cross-site page cannot attach a custom header
 * without a CORS preflight basegeek will not clear for it, which is what makes
 * the echo meaningful — the origin allow-list alone cannot tell one
 * `*.clintgeek.com` app from another.
 *
 * basegeek ships the check in report-only mode (`CSRF_TOKEN=report`), so a
 * missing header is logged rather than blocked until every direct caller is
 * sending it. See apps/basegeek/packages/api/src/middleware/csrfToken.js.
 */
export const CSRF_COOKIE_NAME = 'geek_csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** Methods that carry no CSRF risk and are never checked server-side. */
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Read the CSRF token out of `document.cookie`.
 *
 * Read fresh on every call rather than cached: basegeek rotates the cookie on
 * every refresh, and a cached copy would go stale exactly when the session is
 * healthiest. Returns null server-side, in a browser with cookies disabled, or
 * before basegeek has issued one.
 */
export function readCsrfToken() {
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

/**
 * Headers to merge into any state-changing request aimed at basegeek.
 *
 * Returns `{}` when there is no token, so a caller can always spread it:
 * `headers: { ...csrfHeaders() }`. An empty object is the honest answer for a
 * session issued before this shipped — basegeek back-fills the cookie on the
 * next request, and its report-only mode means the gap costs a log line, not a
 * failure.
 *
 * Exported for the call sites that talk to basegeek without going through this
 * module: packages/api-client's Apollo link, startgeek's hand-rolled fetches,
 * and basegeek's own axios instance.
 *
 * @param {string} [method] – skips the header for GET/HEAD/OPTIONS/TRACE when
 *   given. Omit it to always get the header.
 */
export function csrfHeaders(method) {
  if (method && CSRF_SAFE_METHODS.has(String(method).toUpperCase())) return {};
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/** Lowercase form, for the case-insensitive sweep below. */
const CSRF_HEADER_LOWER = CSRF_HEADER_NAME.toLowerCase();

/**
 * The two 403 codes basegeek's csrfTokenGuard returns under `CSRF_TOKEN=enforce`
 * (apps/basegeek/packages/api/src/middleware/csrfToken.js's `violation()`):
 * no header at all, or a header that does not match the cookie.
 */
export const CSRF_FAILURE_CODES = ['csrf_token_missing', 'csrf_token_invalid'];

/**
 * Pull the CSRF failure code out of a 403 response body, tolerating the one
 * shape csrfTokenGuard actually sends (`{ error: 'csrf_token_missing' }`)
 * alongside `{ code }` / `{ error: { code } }` for any wrapper — GraphQL's
 * error formatting among them — that ends up nesting it differently.
 */
export function extractCsrfErrorCode(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.code === 'string') return data.code;
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error === 'object' && typeof data.error.code === 'string') {
    return data.error.code;
  }
  return null;
}

/** True when `status`/`data` is one of basegeek's CSRF-guard 403s. */
export function isCsrfFailure(status, data) {
  return status === 403 && CSRF_FAILURE_CODES.includes(extractCsrfErrorCode(data));
}

/** sessionStorage key guarding the one-reload-per-session rule below. */
export const CSRF_RELOAD_FLAG_KEY = 'geeksuite:csrf-reload-attempted';

/**
 * Heal a tab that predates the CSRF rollout (or hit some other unrecoverable
 * mismatch) by reloading it once. Only ever called after a retry with a
 * freshly-read cookie has *already* failed with the same code, so this is
 * the last resort, not the first.
 *
 * Guarded by a sessionStorage flag rather than an in-memory one: the flag has
 * to survive the reload itself, or a setup that is genuinely broken (cookies
 * blocked, third-party storage disabled) would reload forever. If
 * sessionStorage itself is unreachable, there is no way to remember across a
 * future load — this reloads once for this page and accepts that risk rather
 * than never healing at all.
 *
 * A full reload is not free: it drops any unsaved state in the page (an open
 * form, an in-progress edit) exactly like any other forced navigation would.
 * That's the tradeoff for a tab that cannot otherwise get out of a 403 loop;
 * it never fires for anything but this specific, otherwise-unrecoverable
 * CSRF mismatch, and at most once per browser session.
 */
export function triggerCsrfReloadOnce() {
  if (typeof window === 'undefined' || !window.location) return;

  try {
    if (window.sessionStorage) {
      if (window.sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY)) return;
      window.sessionStorage.setItem(CSRF_RELOAD_FLAG_KEY, '1');
    }
  } catch {
    // sessionStorage inaccessible (private browsing, storage disabled) — fall
    // through and reload anyway; see the note above.
  }

  window.location.reload();
}

/**
 * Stamp the *current* CSRF token onto an axios request config, replacing
 * whatever was there.
 *
 * The replacement is the point. basegeek rotates `geek_csrf` on every
 * `/auth/refresh` (setSSOCookies in its routes/auth.js), and the response
 * interceptor below recovers from a 401/403 by refreshing and then replaying
 * the *original* config through this same interceptor. That config still
 * carries the header we stamped on it before the refresh — i.e. the
 * pre-rotation value. A `if (!headers[name])` guard would preserve it, and
 * under `CSRF_TOKEN=enforce` basegeek would 403 the retry as
 * `csrf_token_invalid`, turning a recoverable expiry into a logout.
 *
 * The cookie is the only source of truth here, so an explicitly-set header
 * loses to it — a caller cannot know the token better than the jar does.
 *
 * Clears any case-variant first: axios normalizes header names on a config
 * that has already been through a request, so the stale value can come back
 * spelled differently than we wrote it.
 *
 * @param {object} config axios request config (headers may be a plain object
 *   or an AxiosHeaders instance).
 */
function applyCsrfHeader(config) {
  const headers = config?.headers;
  if (!headers || typeof headers !== 'object') return;

  if (typeof headers.delete === 'function') {
    headers.delete(CSRF_HEADER_NAME);
  } else {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === CSRF_HEADER_LOWER) delete headers[key];
    }
  }

  const token = csrfHeaders(config.method)[CSRF_HEADER_NAME];
  if (!token) return;

  if (typeof headers.set === 'function') headers.set(CSRF_HEADER_NAME, token);
  else headers[CSRF_HEADER_NAME] = token;
}

let refreshTimerId = null;
let isRefreshing = false;
let refreshQueue = [];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GEEK_TOKEN_KEY);
}

function getStoredRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GEEK_REFRESH_TOKEN_KEY);
}

function saveTokens(token, refreshToken) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(GEEK_TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(GEEK_REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GEEK_TOKEN_KEY);
  localStorage.removeItem(GEEK_REFRESH_TOKEN_KEY);
}

function getTokensFromUrl() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const refreshToken = params.get('refreshToken');
  return { token, refreshToken };
}

function getBaseGeekUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (
      import.meta.env.VITE_BASEGEEK_URL ||
      import.meta.env.VITE_BASE_GEEK_URL ||
      'https://basegeek.clintgeek.com'
    );
  }
  return 'https://basegeek.clintgeek.com';
}

function getApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const raw = import.meta.env.VITE_API_URL;
    if (raw) {
      const base = String(raw).replace(/\/$/, '');
      return base.endsWith('/api') ? base : `${ base }/api`;
    }
  }
  return '/api';
}

function sanitizeRedirectTarget(target) {
  try {
    const url = new URL(target);
    const p = url.pathname || '/';
    if (p === '/login' || p === '/register') {
      return url.origin + '/';
    }
    return url.toString();
  } catch {
    return window.location.origin + '/';
  }
}

/**
 * Announce a logout to every other tab/app in the suite.
 */
export function broadcastLogout() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return;
  try {
    const bc = new BroadcastChannel(AUTH_CHANNEL);
    bc.postMessage({ type: AUTH_LOGOUT, sender: TAB_ID });
    bc.close();
  } catch {
    // ignore
  }
}

function processRefreshQueue(error, token = null) {
  refreshQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  refreshQueue = [];
}

async function doTokenRefresh() {
  const apiBase = getApiBase();

  // Cookie-first: let the shared HttpOnly geek_refresh_token cookie carry the token.
  // The stored localStorage refresh token is a stale fallback across apps/tabs and
  // would trigger rotation-reuse revocation if sent in the body.
  const res = await fetch(`${ apiBase }/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify({}),
  });

  if (res.status === 401 || res.status === 403) {
    clearTokens();
    const error = new Error('Session expired');
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || 'Token refresh failed');
  }

  if (data.token) {
    saveTokens(data.token, data.refreshToken);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current user from the app's own backend session cookie.
 * Returns the user object or null if not authenticated.
 */
export async function getMe() {
  const apiBase = getApiBase();

  const fetchMe = async () => {
    // 1. Check for tokens in URL (SSO redirect)
    const { token: urlToken, refreshToken: urlRefreshToken } = getTokensFromUrl();
    if (urlToken) {
      saveTokens(urlToken, urlRefreshToken);
      // Clean up URL
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        url.searchParams.delete('refreshToken');
        window.history.replaceState({}, '', url.toString());
      } catch (e) {
        console.warn('Failed to clean up URL params', e);
      }
    }

    // 2. Prepare request with stored token if available
    const token = getStoredToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${ token }`;
    }

    return await fetch(`${ apiBase }/me`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    });
  };

  let res = await fetchMe();

  if (res.status === 401) {
    // Attempt hydration refresh
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        await doTokenRefresh();
        processRefreshQueue(null);
        // Retry fetchMe
        res = await fetchMe();
      } catch (error) {
        processRefreshQueue(error);
        return null;
      } finally {
        isRefreshing = false;
      }
    } else {
      try {
        await new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        });
        res = await fetchMe();
      } catch {
        return null;
      }
    }
  }

  if (res.status === 401) {
    clearTokens();
    return null;
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    const message =
      json?.error?.message || json?.message || 'Failed to load session';
    throw new Error(message);
  }

  return json?.data?.user || json?.user || null;
}

/**
 * Redirect the browser to the baseGeek login (or register) page.
 *
 * @param {string} appName   – e.g. 'notegeek', 'musicgeek'
 * @param {string} [returnTo] – URL to redirect back to after login
 * @param {'login'|'register'} [mode='login']
 */
export function loginRedirect(appName, returnTo, mode = 'login') {
  if (typeof window === 'undefined') return;
  const baseGeekUrl = getBaseGeekUrl();
  const path = mode === 'register' ? '/register' : '/login';
  const url = new URL(`${ baseGeekUrl }${ path }`);
  url.searchParams.set('app', appName);
  url.searchParams.set(
    'redirect',
    sanitizeRedirectTarget(returnTo || window.location.href)
  );
  window.location.href = url.toString();
}

/**
 * Log out: hit the app backend then broadcast across tabs.
 */
export async function logout() {
  const apiBase = getApiBase();
  const token = getStoredToken();
  const headers = { 'Content-Type': 'application/json', ...csrfHeaders() };
  if (token) {
    headers['Authorization'] = `Bearer ${ token }`;
  }

  try {
    await fetch(`${ apiBase }/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers
    });
  } catch {
    // ignore
  }
  clearTokens();
  broadcastLogout();
}

/**
 * Subscribe to cross-tab logout events. Returns an unsubscribe function.
 */
export function onLogout(callback) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    return () => { };
  }

  try {
    const bc = new BroadcastChannel(AUTH_CHANNEL);
    const handler = (event) => {
      const data = event?.data;
      if (data?.type !== AUTH_LOGOUT) return;
      // Ignore the message this tab just sent — its own logout path already ran.
      if (data.sender && data.sender === TAB_ID) return;
      callback?.();
    };
    bc.addEventListener('message', handler);
    return () => {
      try {
        bc.removeEventListener('message', handler);
        bc.close();
      } catch {
        // ignore
      }
    };
  } catch {
    return () => { };
  }
}

/**
 * Start a periodic cookie-refresh timer. Calls `onFailure` when the session
 * has expired (401/403).
 */
export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  const apiBase = getApiBase();
  async function autoRefresh() {
    try {
      await doTokenRefresh();
    } catch {
      // transient failure — keep trying, or if 401/403, stop timer
      stopRefreshTimer();
      if (onFailure) onFailure();
    }
  }
  // Stagger the first mount refresh so multiple open apps/tabs don't all hit
  // /auth/refresh simultaneously with the same pre-rotation cookie.
  const initialDelay = Math.floor(Math.random() * 5000);
  refreshTimerId = setTimeout(() => {
    autoRefresh();
    refreshTimerId = setInterval(autoRefresh, REFRESH_INTERVAL_MS);
  }, initialDelay);
}

/**
 * Stop the refresh timer if one is running.
 */
export function stopRefreshTimer() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}

/**
 * Configure an Axios instance with request and response interceptors.
 * - Request interceptor: Adds the stored token to the Authorization header.
 * - Response interceptor: Handles automatic token refreshing on 401/403 responses.
 *
 * @param {import('axios').AxiosInstance} axiosInstance - The Axios instance to configure
 * @param {Function} [onSessionExpired] - Callback to trigger user logout or UI notification when the refresh fails
 */
export function setupAxiosInterceptors(axiosInstance, onSessionExpired) {
  // Add a request interceptor to include the token in the Authorization header
  axiosInstance.interceptors.request.use(
    (config) => {
      const token = getStoredToken();
      if (token && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${ token }`;
      }
      // Double-submit CSRF token on anything that can change state. Set here
      // rather than at each call site so an app cannot forget it, read per
      // request because basegeek rotates the cookie on every refresh, and
      // *overwritten* rather than merged so a post-refresh replay cannot carry
      // the pre-rotation value. See applyCsrfHeader().
      applyCsrfHeader(config);
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add a response interceptor
  axiosInstance.interceptors.response.use(
    (response) => {
      // Any status code that lie within the range of 2xx cause this function to trigger
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      // A stale tab loaded before this rollout (or before the cookie rotated
      // under it) can post with no header, or the pre-rotation one. Handle
      // that ahead of the generic 401/403 branch below — it needs one retry
      // with a freshly-read cookie, not a JWT refresh.
      if (originalRequest && error.response && isCsrfFailure(error.response.status, error.response.data)) {
        if (!originalRequest._csrfHealRetried) {
          originalRequest._csrfHealRetried = true;
          // The cookie may have just been (re)issued — ensureCsrfCookie()
          // back-fills it on the very response we're reacting to — or rotated
          // by a concurrent refresh in another tab. applyCsrfHeader() always
          // reads the live cookie, never the stale value this request was
          // built with.
          applyCsrfHeader(originalRequest);
          return axiosInstance(originalRequest);
        }

        // Retried once with a freshly-read cookie and still the same
        // failure: this isn't a rotation race, so the only fix left is a
        // reload. Never reaches here for any other 403 — isCsrfFailure()
        // gates on the specific codes.
        triggerCsrfReloadOnce();
        return Promise.reject(error);
      }

      // Check if it's a 401/403 Auth error and we haven't already retried
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403) &&
        !originalRequest._retry
      ) {

        // Prevent infinite loops on the refresh endpoint itself
        if (originalRequest.url?.includes('/auth/refresh')) {
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        if (!isRefreshing) {
          isRefreshing = true;

          try {
            await doTokenRefresh();
            // Process the queue queue
            processRefreshQueue(null);

            // Re-run the original request with the new token
            const token = getStoredToken();
            if (token) {
              originalRequest.headers['Authorization'] = `Bearer ${ token }`;
            }
            return axiosInstance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, queue needs to be rejected
            processRefreshQueue(refreshError);

            // Trigger logout procedure
            clearTokens();
            broadcastLogout();
            stopRefreshTimer();
            if (onSessionExpired) onSessionExpired();

            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        } else {
          // If a refresh is already in progress, wait for it to finish
          return new Promise((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
          })
            .then(() => {
              // Once refresh completes, replay original request with the new token
              const token = getStoredToken();
              if (token) {
                originalRequest.headers['Authorization'] = `Bearer ${ token }`;
              }
              return axiosInstance(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }
      }

      // If not 401 or retry already failed, reject everything else normally
      return Promise.reject(error);
    }
  );
}
