import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMe, logout as logoutClient, onLogout, startRefreshTimer, stopRefreshTimer } from "../utils/authClient";

const AuthContext = createContext({
  isAuthenticated: false,
  user: null,
  logout: () => {}
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await getMe();
      if (cancelled) return;
      setUser(me);
      if (me) startRefreshTimer(() => setUser(null));
      setIsLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setUser(null);
        setIsLoading(false);
      }
    });

    const unsubscribe = onLogout(() => {
      setUser(null);
      stopRefreshTimer();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopRefreshTimer();
    };
  }, []);

  const logout = async () => {
    await logoutClient();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(user),
      user,
      isLoading,
      logout
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
