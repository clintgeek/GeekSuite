const BASEGEEK_URL =
  import.meta.env.VITE_BASEGEEK_URL ||
  import.meta.env.VITE_BASE_GEEK_URL ||
  'https://basegeek.clintgeek.com';
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

let refreshTimerId = null;

function getBackendOrigin() {
  if (!import.meta.env.DEV) return '';
  const hostname = window.location.hostname;
  const noteGeekPort = 5001;
  return `http://${hostname}:${noteGeekPort}`;
}

function apiUrl(pathname) {
  return `${getBackendOrigin()}${pathname}`;
}

export async function getMe() {
  const res = await fetch(apiUrl('/api/me'), {
    credentials: 'include',
    cache: 'no-store',
  });

  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch session');

  const data = await res.json();
  return data.user || null;
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

export function loginRedirect(returnTo = window.location.href, mode = 'login') {
  const path = mode === 'register' ? '/register' : '/login';
  const url = new URL(`${BASEGEEK_URL}${path}`);
  url.searchParams.set('app', import.meta.env.VITE_BASEGEEK_APP || 'notegeek');
  url.searchParams.set('redirect', sanitizeRedirectTarget(returnTo));
  window.location.href = url.toString();
}

function broadcastLogout() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return;
  const channel = new BroadcastChannel('geeksuite-auth');
  channel.postMessage({ type: 'LOGOUT' });
  channel.close();
}

export async function logout() {
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } finally {
    broadcastLogout();
  }
}

export function onLogout(callback) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    return () => {};
  }

  const channel = new BroadcastChannel('geeksuite-auth');
  channel.onmessage = (event) => {
    if (event.data?.type === 'LOGOUT') {
      callback();
    }
  };

  return () => {
    channel.close();
  };
}

export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  async function doRefresh() {
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), {
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

export function stopRefreshTimer() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}
