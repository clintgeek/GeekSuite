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

// Foreground refresh (2026-10-16, REVIEW_2026-10 B1). The access token lives
// an hour. Android freezes a backgrounded PWA's timers, so the 50-minute
// interval above can sleep straight through the expiry; when the app comes
// back to the front, refresh first if the token has under STALE_MARGIN_MS
// left. When the token's expiry can't be read (no stored copy, cookie-only
// session), fall back to "the last refresh is older than
// UNKNOWN_EXPIRY_MAX_AGE_MS".
export const STALE_MARGIN_MS = 5 * 60 * 1000;
export const UNKNOWN_EXPIRY_MAX_AGE_MS = 45 * 60 * 1000;

/** localStorage key for the last user /api/me returned (see B2 below). */
export const USER_CACHE_KEY = 'geeksuite:last-user';

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
let removeForegroundListeners = null;

// Single-flight refresh. basegeek rotates the refresh token on every
// /auth/refresh, so two concurrent refreshes from one tab race each other and
// the loser replays a token that was just rotated — which basegeek reads as
// reuse and answers 401. Every caller (axios, Apollo, getMe, the timer, the
// foreground check) shares the one promise in flight.
let refreshPromise = null;
let lastRefreshAt = 0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GEEK_TOKEN_KEY);
}

// There is deliberately no `getStoredRefreshToken()`. The stored copy is
// written by saveTokens() and cleared by clearTokens(), but it is never
// *read*: refresh is cookie-first (see doTokenRefresh), and replaying a
// localStorage refresh token that another app or tab has already rotated is
// exactly what trips basegeek's rotation-reuse revocation. The getter existed,
// unused, and read like an invitation.

function saveTokens(token, refreshToken) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(GEEK_TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(GEEK_REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GEEK_TOKEN_KEY);
  localStorage.removeItem(GEEK_REFRESH_TOKEN_KEY);
  // The session is over, so the remembered user goes with it.
  clearCachedUser();
}

// ---------------------------------------------------------------------------
// Last known user (2026-10-16, REVIEW_2026-10 B2)
//
// AuthProvider keeps the user it last saw so a failed /api/me that is NOT a
// 401 — offline, a 502 while the fleet restarts, a timeout — doesn't read as
// "signed out". localStorage rather than sessionStorage: an installed PWA that
// Android killed in the background starts a fresh session, and that cold start
// is exactly when the cache is needed. It holds what /api/me already returns
// to the page; the token sitting next to it in the same storage is the more
// sensitive thing. Every access is wrapped: blocked storage just means no
// cache, never a crash.
// ---------------------------------------------------------------------------

export function readCachedUser() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

export function writeCachedUser(user) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    if (user && typeof user === 'object') {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore: no cache is the safe answer
  }
}

export function clearCachedUser() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore
  }
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

  // 400 is basegeek's "Refresh token is required": there is no refresh
  // cookie at all, so there is no session to keep.
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    clearTokens();
    const error = new Error('Session expired');
    error.status = res.status;
    throw error;
  }

  if (!res.ok) {
    // A 5xx (nginx while a container restarts, the app backend unable to
    // reach basegeek) says nothing about the session. Stamp the status so
    // callers can tell, and don't trust the body: it is often an HTML page.
    const data = await res.json().catch(() => null);
    const error = new Error(data?.message || 'Token refresh failed');
    error.status = res.status;
    // Apollo-shaped too: the shared error link surfaces this error as the
    // operation's networkError, and readers look for `statusCode` there.
    error.statusCode = res.status;
    throw error;
  }

  const data = await res.json();
  if (data?.success === false) {
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
 * Refresh the session once, shared by everyone who asks while it is in
 * flight. Resolves with basegeek's refresh response. Rejects with an error
 * whose `status` is 400/401/403 when the session is over (see
 * isSessionExpiredError) and anything else when the refresh merely couldn't
 * happen right now.
 */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = doTokenRefresh()
      .then((data) => {
        lastRefreshAt = Date.now();
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Resolves once any refresh in flight has settled (either way); resolves at
 * once when there is none. Request paths await this so a request sent while
 * the foreground refresh runs carries the new token rather than the old one.
 */
export function waitForRefresh() {
  if (!refreshPromise) return Promise.resolve();
  return refreshPromise.then(() => undefined, () => undefined);
}

/** Expiry of a JWT in ms since epoch, or null when it can't be read. */
function tokenExpiryMs(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const exp = JSON.parse(atob(padded))?.exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True when the session should be refreshed before the next request: the
 * stored token expires within STALE_MARGIN_MS (or already has), or — when its
 * expiry can't be read — the last refresh is older than
 * UNKNOWN_EXPIRY_MAX_AGE_MS.
 */
export function sessionNeedsRefresh(now = Date.now()) {
  let token = null;
  try {
    token = getStoredToken();
  } catch {
    token = null;
  }
  const exp = tokenExpiryMs(token);
  if (exp !== null) return exp - now < STALE_MARGIN_MS;
  return !lastRefreshAt || now - lastRefreshAt > UNKNOWN_EXPIRY_MAX_AGE_MS;
}

/** Test hook: forget the last refresh time and any refresh in flight. */
export function resetRefreshStateForTests() {
  refreshPromise = null;
  lastRefreshAt = 0;
}

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
    // Attempt hydration refresh. Only a refresh that says the session is over
    // means "signed out" (null). One that couldn't happen — offline, a 502
    // mid-restart — throws, so the caller can keep the user it knew and try
    // again (REVIEW_2026-10 B2). Returning null here logged Heather out every
    // time the fleet restarted while her token was due.
    try {
      await refreshSession();
    } catch (error) {
      if (isSessionExpiredError(error)) return null;
      throw error;
    }
    res = await fetchMe();
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
 * True only for the failures that mean "this session is over".
 *
 * `doTokenRefresh()` throws with `error.status` 401 or 403 (and 400, "no
 * refresh token at all") for those responses. Everything else is transient —
 * a rejected `fetch` (the wifi blinked, the laptop just woke), a 502 from nginx
 * while the container restarts (its error carries `status` 502, which is not
 * in this list), a 200 whose body is an HTML error page and blows up
 * `res.json()`.
 */
export function isSessionExpiredError(error) {
  return error?.status === 401 || error?.status === 403 || error?.status === 400;
}

/**
 * Start a periodic cookie-refresh timer. Calls `onFailure` when the session
 * has expired (401/403).
 *
 * A transient failure is NOT an expiry. `AuthProvider` wires `onFailure` to
 * "clear the user and run the app's logout callback", so treating every
 * rejection as terminal — which is what this did, despite a comment saying it
 * did not — logged the user out of an app they were still signed into because
 * one background refresh 50 minutes in caught a dropped connection or a
 * restarting backend. The timer keeps running in that case and tries again on
 * the next tick; only a real 401/403 stops it and reports.
 */
export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  async function autoRefresh() {
    try {
      await refreshSession();
    } catch (error) {
      if (!isSessionExpiredError(error)) {
        // Transient — leave the interval running and try again next tick.
        // Nothing here clears tokens: doTokenRefresh() only does that on the
        // 401/403 branch, and a network blip must not look like a logout.
        console.warn('[geeksuite/auth] background token refresh failed; will retry', error);
        return;
      }
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

  // The interval doesn't run while Android has the app frozen in the
  // background, so also check on the way back to the front. Registered here,
  // at sign-in, which is before the app's own screens mount and add theirs:
  // listeners fire in order, so the refresh starts before a screen's
  // foreground refetch, and waitForRefresh() holds that refetch until it lands.
  removeForegroundListeners = addForegroundListener(() => {
    if (sessionNeedsRefresh()) autoRefresh();
  });
}

/**
 * Call `fn` when the page comes back to the front (visibilitychange to
 * visible, or window focus). Returns a remover. A no-op outside a browser.
 */
function addForegroundListener(fn) {
  const win = typeof window !== 'undefined' ? window : null;
  const doc = typeof document !== 'undefined' ? document : null;
  const onVisibility = () => {
    if (doc && doc.visibilityState && doc.visibilityState !== 'visible') return;
    fn();
  };
  const onFocus = () => fn();
  try {
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', onVisibility);
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('focus', onFocus);
    }
  } catch {
    // ignore
  }
  return () => {
    try {
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', onVisibility);
      }
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('focus', onFocus);
      }
    } catch {
      // ignore
    }
  };
}

/**
 * Stop the refresh timer if one is running.
 */
export function stopRefreshTimer() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
  if (removeForegroundListeners) {
    removeForegroundListeners();
    removeForegroundListeners = null;
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
      // A refresh in flight (the app just came back to the front) is about
      // to replace the token; wait for it rather than send the old one.
      // Synchronous when there is none, which is nearly always.
      if (refreshPromise) return waitForRefresh().then(() => stampRequest(config));
      return stampRequest(config);
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  function stampRequest(config) {
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
  }

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

        try {
          // Shared with every other caller: concurrent 401s wait on one
          // refresh instead of each rotating the token in turn.
          await refreshSession();
        } catch (refreshError) {
          // Only a refresh that says the session is over ends it. One that
          // couldn't happen (offline, a 502 mid-restart) is surfaced as its
          // own error and the session is left alone: logging out here, on
          // every tab via the broadcast, is what a fleet restart used to do
          // to anyone whose token was due (REVIEW_2026-10 B1).
          if (isSessionExpiredError(refreshError)) {
            clearTokens();
            broadcastLogout();
            stopRefreshTimer();
            if (onSessionExpired) onSessionExpired();
          }
          return Promise.reject(refreshError);
        }

        // Re-run the original request with the new token
        const token = getStoredToken();
        if (token) {
          originalRequest.headers['Authorization'] = `Bearer ${ token }`;
        }
        return axiosInstance(originalRequest);
      }

      // If not 401 or retry already failed, reject everything else normally
      return Promise.reject(error);
    }
  );
}
