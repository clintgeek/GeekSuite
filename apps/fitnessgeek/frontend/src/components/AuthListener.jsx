import { useEffect, useRef } from 'react';
import { useAuth } from '@geeksuite/auth';
import { streakService } from '../services/streakService';
import { useToday } from '../hooks/useToday.js';
import { userKeyOf } from '../utils/experience.js';
import logger from '../utils/logger';

/**
 * Records the daily login streak, once per person per calendar day.
 *
 * The "already recorded" marker is per person (two people on one phone each
 * keep their own streak) and keyed by `useToday()`, so an installed PWA kept
 * alive across midnight records the new day when it comes back to the
 * foreground instead of missing it.
 */
const streakKeyFor = (userKey) => `fitnessgeek_last_login_recorded.${userKey}`;

export default function AuthListener() {
  const { user } = useAuth();
  const today = useToday();
  const userKey = userKeyOf(user);
  const inFlight = useRef(null);

  useEffect(() => {
    if (!userKey) return;
    const key = streakKeyFor(userKey);
    const marker = `${key}|${today}`;
    if (inFlight.current === marker) return;

    let last = null;
    try {
      last = localStorage.getItem(key);
    } catch {
      // Blocked storage: record anyway; the server keeps one entry per day.
    }
    if (last === today) return;

    inFlight.current = marker;
    (async () => {
      try {
        await streakService.recordLogin({ date: today });
        try { localStorage.setItem(key, today); } catch { /* convenience only */ }
      } catch (e) {
        // Try again on the next foreground of the same day.
        inFlight.current = null;
        logger.error('Failed to record daily login streak:', e);
      }
    })();
  }, [userKey, today]);

  return null;
}
