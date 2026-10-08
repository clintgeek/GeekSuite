import { useCallback, useEffect, useMemo, useRef } from 'react';

export const LONG_PRESS_MS = 500;
// A finger that moves further than this is scrolling, not pressing.
const MOVE_TOLERANCE = 10;

/**
 * Long-press on a row (spec COMPOSE_MANY_AND_ARCHIVE U1): hold ~500 ms and
 * `onLongPress` runs — and the click that follows the lift is swallowed, so
 * the row does NOT navigate. Moving the finger (a scroll) or lifting early
 * cancels it, and an ordinary tap is untouched.
 *
 * Android opens a link's context menu on a long press; that is suppressed
 * for touch (and after a press fired), never for a desktop right-click.
 *
 * Returns handlers to spread on the row. `null` callback → no handlers.
 */
export function useLongPress(onLongPress, { ms = LONG_PRESS_MS } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const touch = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const enabled = Boolean(onLongPress);
  return useMemo(() => {
    if (!enabled) return {};
    return {
      onPointerDown: (e) => {
        // Primary button / a finger / a pen only.
        if (e.button !== undefined && e.button !== 0) return;
        fired.current = false;
        touch.current = e.pointerType === 'touch';
        start.current = { x: e.clientX || 0, y: e.clientY || 0 };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          try { navigator.vibrate?.(10); } catch { /* not on this device */ }
          callback.current?.();
        }, ms);
      },
      onPointerMove: (e) => {
        if (!start.current) return;
        const dx = (e.clientX || 0) - start.current.x;
        const dy = (e.clientY || 0) - start.current.y;
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e) => {
        if (fired.current || touch.current) e.preventDefault();
      },
      // Capture, so the row's own onClick / the router Link never sees the
      // click that ends a long press.
      onClickCapture: (e) => {
        if (fired.current) {
          fired.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    };
  }, [enabled, ms, cancel]);
}

export default useLongPress;
