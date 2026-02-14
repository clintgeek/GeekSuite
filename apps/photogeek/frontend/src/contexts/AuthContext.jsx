import { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { getMe, loginRedirect, logout as ssoLogout, onLogout, startRefreshTimer, stopRefreshTimer } from '../utils/authClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await getMe();
        if (!mounted) return;
        setUser(me);
        if (me) startRefreshTimer(() => setUser(null));
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    const unsubscribe = onLogout(() => {
      setUser(null);
      stopRefreshTimer();
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      stopRefreshTimer();
    };
  }, []);

  const login = async () => loginRedirect(window.location.href, 'login');
  const register = async () => loginRedirect(window.location.href, 'register');

  const logout = async () => {
    await ssoLogout();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      isAuthenticated: !!user,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
// Force rebuild
