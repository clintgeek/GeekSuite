import { useEffect, useRef } from 'react';
import { useAuth } from '@geeksuite/auth';
import { streakService } from '../services/streakService';
import logger from '../utils/logger';

/**
 * Listens to auth changes and records daily streaks
 */
export default function AuthListener() {
  const { user } = useAuth();
  const recordedToday = useRef(false);

  useEffect(() => {
    if (user && !recordedToday.current) {
      recordDailyLoginIfNeeded();
    }
  }, [user]);

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
        recordedToday.current = true;
      }
    } catch (e) {
      logger.error('Failed to record daily login streak:', e);
    }
  };

  return null;
}
