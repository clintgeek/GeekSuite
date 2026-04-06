import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  getMe,
  loginRedirect,
  logout as logoutRequest,
  onLogout,
  startRefreshTimer,
  stopRefreshTimer,
} from './authClient.js';

const AuthContext = createContext(null);

/**
 * Provides authentication state for a GeekSuite app.
 *
 * Props:
 *   appName  – required, e.g. 'notegeek'
 *   onLogout – optional callback fired after logout completes (e.g. to reset app stores)
 */
export function AuthProvider({ appName, onLogout: onLogoutCallback, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hydrate session on mount
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        if (me) {
          startRefreshTimer(() => {
            setUser(null);
            onLogoutCallback?.();
          });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
      stopRefreshTimer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab logout listener
  useEffect(() => {
    return onLogout(() => {
      setUser(null);
      stopRefreshTimer();
      onLogoutCallback?.();
    });
  }, [onLogoutCallback]);

  const login = useCallback(
    (returnTo) => {
      setError(null);
      loginRedirect(appName, returnTo || window.location.href, 'login');
    },
    [appName]
  );

  const register = useCallback(
    (returnTo) => {
      setError(null);
      loginRedirect(appName, returnTo || window.location.href, 'register');
    },
    [appName]
  );

  const logout = useCallback(async () => {
    stopRefreshTimer();
    onLogoutCallback?.();
    await logoutRequest();
    setUser(null);
    setError(null);
  }, [onLogoutCallback]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      register,
      logout,
      isAuthenticated: !!user,
    }),
    [user, loading, error, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
