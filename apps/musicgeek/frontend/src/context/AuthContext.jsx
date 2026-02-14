import { createContext, useContext, useState, useEffect } from 'react';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '../utils/authClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const me = await getMe();
        if (cancelled) return;
        setCurrentUser(me);
        if (me) startRefreshTimer(() => setCurrentUser(null));
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
      stopRefreshTimer();
    };
  }, []);

  useEffect(() => {
    return onLogout(() => {
      setCurrentUser(null);
      stopRefreshTimer();
    });
  }, []);

  const login = () => {
    setError(null);
    const returnTo = `${window.location.origin}/`;
    loginRedirect(returnTo, 'login');
  };

  const register = () => {
    setError(null);
    const returnTo = `${window.location.origin}/`;
    loginRedirect(returnTo, 'register');
  };

  const logout = () => {
    logoutRequest();
    setCurrentUser(null);
  };

  const updateUserData = (userData) => {
    setCurrentUser(userData);
  };

  const value = {
    currentUser,
    isLoading,
    error,
    login,
    register,
    logout,
    updateUserData,
    isAuthenticated: !!currentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useUserMode() {
  const { currentUser } = useAuth();
  return currentUser?.preferences?.uiMode === 'kid' ? 'kid' : 'adult';
}
