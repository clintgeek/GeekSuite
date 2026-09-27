/**
 * motion — the two questions every moving part of the Signal Box asks.
 *
 * CSS already collapses transitions and animations under reduced motion
 * (index.css). These cover what CSS cannot: timers, intervals and anything
 * that decides whether to start at all.
 */
import useMediaQuery from '@mui/material/useMediaQuery';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  return useMediaQuery(REDUCED_MOTION_QUERY, { noSsr: true });
}

/**
 * True under a browser automation driver (the mobile harness runs Playwright,
 * which sets `navigator.webdriver`). Idle theatre never starts there: a
 * screenshot of a screensaver documents nothing.
 */
export function isAutomated() {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true;
  } catch {
    return false;
  }
}
