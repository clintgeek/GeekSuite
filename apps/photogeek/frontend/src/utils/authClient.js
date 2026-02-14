const BASEGEEK_URL = import.meta.env.VITE_BASEGEEK_URL || 'https://basegeek.clintgeek.com';
const LOGOUT_CHANNEL = 'geeksuite-auth';
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

let refreshTimerId = null;

function getApiBase() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw) {
    const base = String(raw).replace(/\/$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  return '/api';
}

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
    const message = json?.error?.message || json?.error || json?.message || 'Failed to load session';
    throw new Error(message);
  }

  return json?.data?.user || null;
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

export function loginRedirect(returnTo, mode = 'login') {
  const path = mode === 'register' ? '/register' : '/login';
  const url = new URL(`${BASEGEEK_URL}${path}`);

  url.searchParams.set('app', import.meta.env.VITE_BASEGEEK_APP || 'photogeek');
  url.searchParams.set('redirect', sanitizeRedirectTarget(returnTo || window.location.href));

  window.location.href = url.toString();
}

export async function logout() {
  const apiBase = getApiBase();

  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore
  }

  try {
    const bc = new BroadcastChannel(LOGOUT_CHANNEL);
    bc.postMessage({ type: 'LOGOUT' });
    bc.close();
  } catch {
    // ignore
  }
}

export function onLogout(callback) {
  try {
    const bc = new BroadcastChannel(LOGOUT_CHANNEL);

    const handler = (event) => {
      if (event?.data?.type === 'LOGOUT') {
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
    } catch {}
  }
  doRefresh();
  refreshTimerId = setInterval(doRefresh, REFRESH_INTERVAL_MS);
}

export function stopRefreshTimer() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}
