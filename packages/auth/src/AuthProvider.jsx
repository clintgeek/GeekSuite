import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getMe,
  loginRedirect,
  logout as logoutRequest,
  onLogout,
  startRefreshTimer,
  stopRefreshTimer,
  clearCachedUser,
} from './authClient.js';
import { createSessionKeeper } from './sessionKeeper.js';

const AuthContext = createContext(null);

/**
 * Provides authentication state for a GeekSuite app.
 *
 * Props:
 *   appName  – required, e.g. 'notegeek'
 *   onLogout – optional callback fired after logout completes (e.g. to reset app stores)
 *
 * Context, besides the user and the login/logout actions:
 *   connectionProblem – true while /api/me can't be reached (offline, a 502
 *                       mid-restart, a timeout). The user stays signed in
 *                       through it — the last known user is kept — and the
 *                       check retries on its own. An app can show "Can't
 *                       reach <App> — retrying" while it's true.
 *   retry             – ask again now (for a "Try again" button).
 */
export function AuthProvider({ appName, onLogout: onLogoutCallback, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const keeperRef = useRef(null);
  const timerStartedRef = useRef(false);

  // Hydrate session on mount. Only a 401 that survives one refresh (getMe
  // answering null) signs the user out; any other failure keeps the user we
  // last knew and retries. See sessionKeeper.js (REVIEW_2026-10 B2).
  useEffect(() => {
    const keeper = createSessionKeeper({
      getMe,
      onUser: (me) => {
        setUser(me);
        if (!timerStartedRef.current) {
          timerStartedRef.current = true;
          startRefreshTimer(() => {
            timerStartedRef.current = false;
            clearCachedUser();
            setUser(null);
            onLogoutCallback?.();
          });
        }
      },
      onSignedOut: () => {
        if (timerStartedRef.current) {
          timerStartedRef.current = false;
          stopRefreshTimer();
        }
        setUser(null);
      },
      onConnectionProblem: setConnectionProblem,
      onSettled: () => setLoading(false),
    });
    keeperRef.current = keeper;
    keeper.start();

    return () => {
      keeper.stop();
      keeperRef.current = null;
      timerStartedRef.current = false;
      stopRefreshTimer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab logout listener
  useEffect(() => {
    return onLogout(() => {
      clearCachedUser();
      timerStartedRef.current = false;
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
    timerStartedRef.current = false;
    onLogoutCallback?.();
    await logoutRequest();
    setUser(null);
    setError(null);
  }, [onLogoutCallback]);

  const retry = useCallback(() => keeperRef.current?.retry(), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      register,
      logout,
      isAuthenticated: !!user,
      connectionProblem,
      retry,
    }),
    [user, loading, error, login, register, logout, connectionProblem, retry]
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
