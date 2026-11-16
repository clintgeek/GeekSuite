/**
 * Re-render when the app comes back to the foreground, so "12m ago" and the
 * masthead date are not frozen at the moment the PWA was put away
 * (SUITE_REVIEW_2026-11 NewsGeek finding 1).
 */
import { useState } from 'react';
import { useRefetchOnResume } from '@geeksuite/ui';

export function useResumeTick({ minIntervalMs = 15 * 1000 } = {}) {
  const [tick, setTick] = useState(0);
  useRefetchOnResume(() => setTick((t) => t + 1), { minIntervalMs });
  return tick;
}
