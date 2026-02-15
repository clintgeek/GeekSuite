const BROADCAST_CHANNEL = 'geeksuite-auth';
const LOGOUT_EVENT_TYPE = 'LOGOUT';
const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

let refreshTimerId = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
      return base.endsWith('/api') ? base : `${base}/api`;
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

function broadcastLogout() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return;
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: LOGOUT_EVENT_TYPE });
    bc.close();
  } catch {
    // ignore
  }
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
  const res = await fetch(`${apiBase}/me`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (res.status === 401) return null;

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
  const url = new URL(`${baseGeekUrl}${path}`);
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
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // ignore
  }
  broadcastLogout();
}

/**
 * Subscribe to cross-tab logout events. Returns an unsubscribe function.
 */
export function onLogout(callback) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    return () => {};
  }

  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    const handler = (event) => {
      if (event?.data?.type === LOGOUT_EVENT_TYPE) {
        callback?.();
      }
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
    return () => {};
  }
}

/**
 * Start a periodic cookie-refresh timer. Calls `onFailure` when the session
 * has expired (401/403).
 */
export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  const apiBase = getApiBase();
  async function doRefresh() {
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401 || res.status === 403) {
        stopRefreshTimer();
        if (onFailure) onFailure();
      }
    } catch {
      // transient failure — keep trying
    }
  }
  doRefresh();
  refreshTimerId = setInterval(doRefresh, REFRESH_INTERVAL_MS);
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
