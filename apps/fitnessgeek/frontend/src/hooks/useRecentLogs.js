import { useEffect, useState } from 'react';
import { apiService } from '../services/apiService.js';
import { daysBefore } from '../utils/experience.js';

/**
 * The person's own recent logs and saved meals — what the "Again" chips and
 * "Same as yesterday's …" are made of (utils/againChips.js).
 *
 * Four weeks of logs is enough to know a habit and small enough to fetch
 * whole: Chef's heaviest month is ~330 rows. Kept in a short-lived module
 * cache so opening the add sheet three times in a sitting asks once.
 */
export const RECENT_DAYS = 28;
const TTL_MS = 2 * 60 * 1000;
const cache = new Map();

const rows = (response) => {
  const data = response?.data ?? response;
  return Array.isArray(data) ? data : [];
};

/** Drop the cache (after a write, or between tests). */
export function forgetRecentLogs() {
  cache.clear();
}

async function load(date) {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const start = daysBefore(date, RECENT_DAYS);
  const [logs, meals] = await Promise.all([
    apiService.get(`/logs?startDate=${start}&endDate=${date}`).then(rows).catch(() => []),
    apiService.get('/meals').then(rows).catch(() => []),
  ]);
  const value = { logs, meals };
  cache.set(date, { at: Date.now(), value });
  return value;
}

/** @returns {{logs: object[], meals: object[], loading: boolean}} */
export function useRecentLogs(date, { enabled = true } = {}) {
  const [state, setState] = useState({ logs: [], meals: [], loading: Boolean(enabled && date) });

  useEffect(() => {
    if (!enabled || !date) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    load(date).then((value) => {
      if (!cancelled) setState({ ...value, loading: false });
    });
    return () => { cancelled = true; };
  }, [date, enabled]);

  return state;
}

export default useRecentLogs;
