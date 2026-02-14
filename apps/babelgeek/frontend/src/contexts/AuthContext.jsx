import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from "../utils/authClient";
import { reset as resetUserStore } from "../utils/resetUserStore";

const AuthContext = createContext({
  isAuthenticated: false,
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const me = await getMe();
        if (mounted) {
          setUser(me);
          if (me) startRefreshTimer(() => setUser(null));
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const unsubscribe = onLogout(() => {
      resetUserStore();
      setUser(null);
      stopRefreshTimer();
    });

    return () => {
      mounted = false;
      unsubscribe();
      stopRefreshTimer();
    };
  }, []);

  const login = useCallback(async (credentials) => {
    loginRedirect(window.location.href, "login");
    return { user: null };
  }, []);

  const register = useCallback(async (userData) => {
    loginRedirect(window.location.href, "register");
    return { user: null };
  }, []);

  const logout = useCallback(() => {
    resetUserStore();
    setUser(null);
    logoutRequest();
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(user),
      user,
      loading,
      login,
      register,
      logout,
    }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
