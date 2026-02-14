import { createContext, useContext, useState, useEffect } from 'react';
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from '../utils/authClient';
import { reset as resetUserStore } from '../utils/resetUserStore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        if (me) startRefreshTimer(() => setUser(null));
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
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
      resetUserStore();
      setUser(null);
      stopRefreshTimer();
    });
  }, []);

  const login = () => {
    const returnTo = `${window.location.origin}/tasks/daily`;
    loginRedirect(returnTo, 'login');
  };

  const register = () => {
    const returnTo = `${window.location.origin}/tasks/daily`;
    loginRedirect(returnTo, 'register');
  };

  const logout = () => {
    resetUserStore();
    logoutRequest();
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};