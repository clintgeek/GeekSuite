import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

// Canonical suite-wide cross-tab auth channel. Mirrors the constants exported by
// `@geeksuite/auth` (packages/auth/src/authClient.js) — basegeek's UI does not
// depend on that package, so the values are duplicated here. Keep them in sync.
const AUTH_CHANNEL = 'geeksuite-auth';
const AUTH_LOGOUT = 'LOGOUT';

// Identifies this browsing context so a tab ignores the logout it sent itself.
const TAB_ID = (() => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
})();

function broadcastLogout() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return;
  try {
    const ch = new BroadcastChannel(AUTH_CHANNEL);
    ch.postMessage({ type: AUTH_LOGOUT, sender: TAB_ID });
    ch.close();
  } catch {
    // ignore
  }
}

function onLogout(callback) {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return () => {};
  try {
    const ch = new BroadcastChannel(AUTH_CHANNEL);
    const handler = (event) => {
      const data = event?.data;
      if (data?.type !== AUTH_LOGOUT) return;
      if (data.sender && data.sender === TAB_ID) return;
      callback?.();
    };
    ch.addEventListener('message', handler);
    return () => {
      try {
        ch.removeEventListener('message', handler);
        ch.close();
      } catch {
        // ignore
      }
    };
  } catch {
    return () => {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/profile')
      .then(res => { if (!cancelled) setUser(res.data); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Cross-tab logout: another tab (or another suite app) logged out. Clearing the
  // user is enough — RequireAuth routes to /login, same as an expired session.
  useEffect(() => {
    return onLogout(() => setUser(null));
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    broadcastLogout();
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useBaseGeekAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useBaseGeekAuth must be used within AuthProvider');
  return ctx;
}
