import logger from './logger.js';

const BASEGEEK_URL = import.meta.env.VITE_BASEGEEK_URL || 'https://basegeek.clintgeek.com';
const SESSION_REFRESH_MINUTES = Math.max(
  5,
  Number(import.meta.env.VITE_SESSION_REFRESH_MINUTES || 15)
);
const SESSION_REFRESH_INTERVAL_MS = SESSION_REFRESH_MINUTES * 60 * 1000;
let refreshTimer = null;

export function getBackendOrigin() {
  if (!import.meta.env.DEV) return '';
  const hostname = window.location.hostname;
  const fitnessGeekPort = 3001;
  return `http://${hostname}:${fitnessGeekPort}`;
}

async function refreshSessionRequest() {
  const res = await fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (res.status === 401) {
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to refresh session');
  }

  return res.json();
}

export function startSessionKeepAlive(onFailure) {
  stopSessionKeepAlive();

  const runRefresh = async () => {
    try {
      await refreshSessionRequest();
      logger.debug('Session refreshed');
    } catch (error) {
      logger.warn('Session refresh failed', error);
      stopSessionKeepAlive();
      if (typeof onFailure === 'function') {
        onFailure(error);
      }
    }
  };

  // Refresh immediately and then on interval
  runRefresh();
  refreshTimer = window.setInterval(runRefresh, SESSION_REFRESH_INTERVAL_MS);
}

export function stopSessionKeepAlive() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function apiUrl(pathname) {
  return `${getBackendOrigin()}${pathname}`;
}

export async function getMe() {
  const res = await fetch(apiUrl('/api/me'), {
    credentials: 'include'
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    throw new Error('Failed to fetch session');
  }

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
  url.searchParams.set('app', 'fitnessgeek');
  url.searchParams.set('redirect', sanitizeRedirectTarget(returnTo));
  window.location.href = url.toString();
}

export async function logout() {
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
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

function broadcastLogout() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    return;
  }

  const channel = new BroadcastChannel('geeksuite-auth');
  channel.postMessage({ type: 'LOGOUT' });
  channel.close();
}
