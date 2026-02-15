import React, { useState, useEffect } from 'react';
import { streakService } from '../services/streakService.js';
import { AuthContext } from './AuthContextDef.jsx';
import logger from '../utils/logger.js';
import {
  getMe,
  loginRedirect,
  logout as logoutServer,
  onLogout as onLogoutBroadcast,
  startRefreshTimer,
  stopRefreshTimer
} from '@geeksuite/auth';

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth on app start
  useEffect(() => {
    let cancelled = false;

    const initializeAuth = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentUser = await getMe();
        if (cancelled) return;

        if (currentUser) {
          setUser(currentUser);
          startRefreshTimer(() => {
            logger.warn('Session expired - forcing logout');
            setUser(null);
          });
          await recordDailyLoginIfNeeded();
        } else {
          setUser(null);
          stopRefreshTimer();
        }
      } catch (error) {
        logger.error('Error initializing auth:', error);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initializeAuth();

    const unsubscribe = onLogoutBroadcast(() => {
      setUser(null);
      setError(null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopRefreshTimer();
    };
  }, []);

  const login = async () => {
    loginRedirect('fitnessgeek', window.location.href, 'login');
  };

  // Record streak once per local calendar day
  const recordDailyLoginIfNeeded = async () => {
    try {
      const todayLocal = (() => {
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        return local.toISOString().split('T')[0];
      })();
      const key = 'fitnessgeek_last_login_recorded';
      const last = localStorage.getItem(key);
      if (last !== todayLocal) {
        await streakService.recordLogin();
        localStorage.setItem(key, todayLocal);
      }
    } catch (e) {
      logger.error('Failed to record daily login streak:', e);
    }
  };

  const register = async () => {
    loginRedirect('fitnessgeek', window.location.href, 'register');
  };

  const logout = async () => {
    await logoutServer();
    stopRefreshTimer();
    setUser(null);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

