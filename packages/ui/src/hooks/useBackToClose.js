import { useEffect, useRef } from 'react';
import { getBackStack } from './backStack.js';

/**
 * Android Back closes the open overlay instead of leaving the page (review
 * 3.27). While `open` is true the overlay owns one history entry at the same
 * URL; Back pops it and calls `onClose(event, 'backButton')`. Closing any
 * other way takes the entry back off. Nested overlays stack, and closing then
 * navigating in the same handler leaves the navigation alone. The full
 * contract is in `./backStack.js`.
 *
 * GeekSheet, GeekDialog, GeekShell's nav drawer, GeekSidebar's temporary
 * drawer, the account menu and the app switcher already call this; an app
 * only needs it for an overlay it builds from raw MUI. Opt out with
 * `enabled: false` (the primitives expose it as `backToClose={false}`) when
 * the caller already manages history for that overlay.
 *
 * @param {boolean} open
 * @param {(event?: Event, reason?: 'backButton') => void} onClose
 * @param {{ enabled?: boolean }} [options]
 */
export function useBackToClose(open, onClose, { enabled = true } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idRef = useRef(null);

  const active = Boolean(open) && enabled !== false;

  useEffect(() => {
    if (!active) return undefined;
    const stack = getBackStack();
    if (!stack) return undefined;
    const id = stack.register(idRef.current, (event) => onCloseRef.current?.(event, 'backButton'));
    idRef.current = id;
    return () => stack.release(id);
  }, [active]);
}

export default useBackToClose;
