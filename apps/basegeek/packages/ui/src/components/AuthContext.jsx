import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

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

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    try {
      const ch = new BroadcastChannel('geeksuite-auth');
      ch.postMessage({ type: 'LOGOUT' });
      ch.close();
    } catch {}
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
