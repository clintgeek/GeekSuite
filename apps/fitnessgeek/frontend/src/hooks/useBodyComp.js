import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateStringDaysAgo } from '@geeksuite/utils';
import { bodyCompService } from '../services/bodyCompService.js';
import logger from '../utils/logger.js';

/** How far back the trend chart reaches. A year of daily scans is ~365 rows. */
export const SCAN_HISTORY_DAYS = 365;

/**
 * Body composition for the Weight & body page: the server's smoothed summary
 * and the raw scans the trend chart smooths itself (with `rollingMean`).
 *
 * The two reads are independent and fail independently — `Promise.allSettled`,
 * not `all` — so a broken scans query still shows the summary, and neither
 * can reach the weight half of the page, which has its own hook.
 *
 * @returns {{ summary: Object|null, scans: Array, loading: boolean,
 *   error: string, scansError: string, reload: () => Promise<void> }}
 */
export function useBodyComp() {
  const [summary, setSummary] = useState(null);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scansError, setScansError] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, sc] = await Promise.allSettled([
      bodyCompService.getSummary(),
      bodyCompService.getScans({ startDate: localDateStringDaysAgo(SCAN_HISTORY_DAYS) }),
    ]);
    if (!alive.current) return;

    if (s.status === 'fulfilled' && s.value?.success && s.value.data) {
      setSummary(s.value.data);
      setError('');
    } else {
      logger.error('[useBodyComp] summary failed:', s.status === 'rejected' ? s.reason : s.value);
      setSummary(null);
      setError('Body composition could not be loaded.');
    }

    if (sc.status === 'fulfilled' && sc.value?.success && Array.isArray(sc.value.data)) {
      setScans(sc.value.data);
      setScansError('');
    } else {
      logger.error('[useBodyComp] scans failed:', sc.status === 'rejected' ? sc.reason : sc.value);
      setScans([]);
      setScansError('The scan history could not be loaded.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
  }, [reload]);

  return { summary, scans, loading, error, scansError, reload };
}

export default useBodyComp;
