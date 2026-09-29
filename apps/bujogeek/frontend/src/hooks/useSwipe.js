import { useCallback, useRef, useState } from 'react';

/**
 * useSwipe — the phone's one-gesture row actions (DOCS/SIMPLE_PLAN.md):
 *
 *   swipe right            done
 *   swipe left             tomorrow
 *   long swipe left        pick a date
 *
 * Pointer events, horizontal only: the gesture locks to an axis after
 * `LOCK_PX` of travel, and a mostly-vertical drag is left to the page scroll
 * (`touch-action: pan-y` on the row does the rest). Nothing happens until the
 * finger lifts; the row follows the finger and shows which action it will
 * take, so letting go short of a threshold is always a safe "never mind".
 *
 * `swipeOutcome` is the decision on its own, so it can be tested without
 * synthesising pointer streams.
 */
export const SWIPE = {
  LOCK_PX: 10,
  ACTION_PX: 72,      // right → done, left → tomorrow
  LONG_FRACTION: 0.5, // left past half the row → pick a date
  LONG_MIN_PX: 160,
};

/**
 * @param {number} dx     horizontal travel in px (+ right)
 * @param {number} width  row width in px
 * @returns {'done'|'tomorrow'|'pick'|null}
 */
export function swipeOutcome(dx, width = 360) {
  if (dx >= SWIPE.ACTION_PX) return 'done';
  const long = Math.max(SWIPE.LONG_MIN_PX, width * SWIPE.LONG_FRACTION);
  if (dx <= -long) return 'pick';
  if (dx <= -SWIPE.ACTION_PX) return 'tomorrow';
  return null;
}

export default function useSwipe({ onDone, onTomorrow, onPick, enabled = true } = {}) {
  const start = useRef(null);
  const axis = useRef(null);
  // A swipe ends in a pointerup, which the browser follows with a click on
  // whatever was under the finger — the words, which would open the editor.
  const swallowClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    start.current = null;
    axis.current = null;
    setDx(0);
    setDragging(false);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (!enabled || e.pointerType === 'mouse' || e.button > 0) return;
    // Never steal a gesture that starts on the checkbox or a form control. The
    // words are a button too (tap = edit), and swiping them is the point.
    if (e.target?.closest?.('input, textarea, select, a, [role="checkbox"], [data-no-swipe]')) return;
    start.current = { x: e.clientX, y: e.clientY, width: e.currentTarget?.offsetWidth || 360 };
    axis.current = null;
  }, [enabled]);

  const onPointerMove = useCallback((e) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!axis.current) {
      if (Math.abs(mx) < SWIPE.LOCK_PX && Math.abs(my) < SWIPE.LOCK_PX) return;
      axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis.current === 'x') {
        setDragging(true);
        try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* not an active pointer */ }
      }
    }
    if (axis.current !== 'x') return;
    setDx(mx);
  }, []);

  const onPointerUp = useCallback((e) => {
    const s = start.current;
    if (!s || axis.current !== 'x') { reset(); return; }
    const outcome = swipeOutcome(e.clientX - s.x, s.width);
    swallowClick.current = true;
    // …if one comes at all. Never let it eat the NEXT, deliberate tap.
    setTimeout(() => { swallowClick.current = false; }, 350);
    reset();
    if (outcome === 'done') onDone?.();
    else if (outcome === 'tomorrow') onTomorrow?.();
    else if (outcome === 'pick') onPick?.();
  }, [onDone, onTomorrow, onPick, reset]);

  const width = start.current?.width || 360;
  return {
    dx,
    dragging,
    pending: dragging ? swipeOutcome(dx, width) : null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
      onClickCapture: (e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      },
    },
  };
}
