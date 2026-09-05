/**
 * Shared `prefers-reduced-motion` detection (DOCS/MOBILE_UI_PLAN.md §2
 * "Motion"). `GeekAppFrame`'s route fade, `GeekSheet`'s drawer/dialog
 * transition and `GeekDialog`'s transition all read this one helper instead
 * of each hand-rolling the same `useMediaQuery` call, so the query string
 * only lives in one place.
 *
 * SSR-safe: `useMediaQuery` has no `window.matchMedia` under a `node` test
 * environment and resolves `false`, same as every other `useMediaQuery`
 * consumer in this package (`useGeekDialogFullScreen`, `GeekSheet`'s own
 * breakpoint check).
 */
import useMediaQuery from '@mui/material/useMediaQuery';

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
