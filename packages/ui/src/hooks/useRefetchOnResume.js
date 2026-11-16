import { useCallback, useEffect, useRef } from 'react';

/** Default gap between two resume-driven reads (TodoGeek's REFRESH_AFTER_MS). */
export const REFETCH_ON_RESUME_MIN_MS = 30 * 1000;
/** Default gap for "the connection came back" (TodoGeek's ONLINE_THROTTLE_MS). */
export const REFETCH_ON_ONLINE_MIN_MS = 5 * 1000;

/**
 * Re-read data when the person comes back to the app (plan 2.3, modelled on
 * TodoGeek's PenContext): the tab or installed PWA becomes visible again, the
 * window regains focus (a desktop tab that never hid), the page is restored
 * from the back-forward cache, or the connection comes back.
 *
 *   useRefetchOnResume(refetch);                       // Apollo's refetch, a reload fn…
 *   useRefetchOnResume(load, { enabled: signedIn, minIntervalMs: 60_000 });
 *
 * Rules:
 *   - never on first mount — the caller's own first load covers that; the
 *     clock starts at mount;
 *   - throttled: a return within `minIntervalMs` of the last run (default
 *     30 s) does nothing, so one return that fires focus AND
 *     visibilitychange is one read; `online` uses its own, shorter gap
 *     (`onlineMinIntervalMs`, default 5 s);
 *   - a `refetch` that returns a promise is not called again until it
 *     settles (no overlapping reads on a flapping connection);
 *   - `pollMs` > 0 also re-reads on that interval while the page is visible
 *     (off by default);
 *   - listeners and the poll are removed on unmount or when `enabled` turns
 *     false. The latest `refetch` is always the one called; it need not be
 *     memoised.
 *
 * Returns `markFresh()`: call it after a read the hook did not make (a pull
 * to refresh, a mutation that returned the new list) to restart the clock.
 *
 * @param {() => unknown} refetch
 * @param {{ enabled?: boolean, minIntervalMs?: number,
 *   onlineMinIntervalMs?: number, focus?: boolean, pollMs?: number }} [options]
 * @returns {() => void} markFresh
 */
export function useRefetchOnResume(
  refetch,
  {
    enabled = true,
    minIntervalMs = REFETCH_ON_RESUME_MIN_MS,
    onlineMinIntervalMs = REFETCH_ON_ONLINE_MIN_MS,
    focus = true,
    pollMs = 0,
  } = {}
) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const lastRun = useRef(0);
  const inFlight = useRef(false);

  // The clock starts at mount: the caller's first load is "the last run".
  useEffect(() => {
    lastRun.current = Date.now();
  }, []);

  const markFresh = useCallback(() => {
    lastRun.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const doc = typeof document === 'undefined' ? null : document;
    const hidden = () => doc?.visibilityState === 'hidden';

    const run = (gap) => {
      if (inFlight.current) return;
      if (Date.now() - lastRun.current < gap) return;
      lastRun.current = Date.now();
      let result;
      try {
        result = refetchRef.current?.();
      } catch {
        return; // A throwing refetch is the caller's to report; stay mounted.
      }
      if (result && typeof result.then === 'function') {
        inFlight.current = true;
        const done = () => {
          inFlight.current = false;
        };
        result.then(done, done);
      }
    };

    const onBack = () => {
      if (hidden()) return;
      run(minIntervalMs);
    };
    const onPageShow = (event) => {
      if (event?.persisted) run(minIntervalMs);
    };
    const onOnline = () => run(onlineMinIntervalMs);

    doc?.addEventListener('visibilitychange', onBack);
    if (focus) window.addEventListener('focus', onBack);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    const poll =
      pollMs > 0
        ? setInterval(() => {
            if (!hidden()) run(Math.min(minIntervalMs, pollMs - 1000));
          }, pollMs)
        : null;

    return () => {
      doc?.removeEventListener('visibilitychange', onBack);
      if (focus) window.removeEventListener('focus', onBack);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      if (poll) clearInterval(poll);
    };
  }, [enabled, minIntervalMs, onlineMinIntervalMs, focus, pollMs]);

  return markFresh;
}

export default useRefetchOnResume;
