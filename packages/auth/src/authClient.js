const BROADCAST_CHANNEL = 'geeksuite-auth';
const LOGOUT_EVENT_TYPE = 'LOGOUT';
const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

let refreshTimerId = null;
let isRefreshing = false;
let refreshQueue = [];

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
  const res = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (res.status === 401 || res.status === 403) {
    const error = new Error('Session expired');
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || 'Token refresh failed');
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
    return await fetch(`${apiBase}/me`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
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
    return () => { };
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
  autoRefresh();
  refreshTimerId = setInterval(autoRefresh, REFRESH_INTERVAL_MS);
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
 * Configure an Axios instance with a response interceptor to handle
 * automatic token refreshing on 401/403 unauthorized responses.
 *
 * @param {import('axios').AxiosInstance} axiosInstance - The Axios instance to configure
 * @param {Function} [onSessionExpired] - Callback to trigger user logout or UI notification when the refresh fails
 */
export function setupAxiosInterceptors(axiosInstance, onSessionExpired) {
  // Add a response interceptor
  axiosInstance.interceptors.response.use(
    (response) => {
      // Any status code that lie within the range of 2xx cause this function to trigger
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

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

            // Re-run the original request that failed
            return axiosInstance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, queue needs to be rejected
            processRefreshQueue(refreshError);

            // Trigger logout procedure
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
              // Once refresh completes, replay original request
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
