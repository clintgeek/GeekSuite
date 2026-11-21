/**
 * Small device hooks: the clock, idleness, the screen wake lock, and a
 * finger swipe. None of them know anything about tasks or ink.
 */
import { useEffect, useRef, useState } from 'react';
import { msUntilTomorrow, todayKey } from '../lib/days.js';

/** Today's key, rolled over at local midnight and re-checked when the tab returns. */
export function useToday() {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    let timer;
    const check = () => setToday((prev) => (prev === todayKey() ? prev : todayKey()));
    const arm = () => {
      timer = setTimeout(() => {
        check();
        arm();
      }, msUntilTomorrow());
    };
    arm();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}

/** The current time, ticking on the minute (a clock face, not a stopwatch). */
export function useMinuteClock(active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    let timer;
    const arm = () => {
      const wait = 60000 - (Date.now() % 60000) + 50;
      timer = setTimeout(() => {
        setNow(new Date());
        arm();
      }, wait);
    };
    arm();
    return () => clearTimeout(timer);
  }, [active]);
  return now;
}

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

/**
 * True after `ms` with no pointer or key input (spec req 14). Any input
 * while idle does NOT clear it here — the docked view decides how it wakes,
 * so the waking touch is never also a tap on what was underneath.
 *
 * @param {number} ms
 * @param {boolean} enabled  false holds the timer (a dialog is open, a save is failing)
 * @returns {[boolean, () => void]} [idle, wake]
 */
export function useIdle(ms, enabled = true) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(null);
  const idleRef = useRef(false);
  idleRef.current = idle;

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      return undefined;
    }
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), ms);
    };
    const onActivity = () => {
      if (!idleRef.current) arm();
    };
    // A hidden tab is not "idle at the desk"; start counting again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !idleRef.current) arm();
    };
    arm();
    ACTIVITY.forEach((type) => window.addEventListener(type, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      ACTIVITY.forEach((type) => window.removeEventListener(type, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled, idle]);

  return [idle, () => setIdle(false)];
}

/**
 * Keep the screen awake while the app is in the foreground (spec req 15).
 * The browser drops the lock whenever the tab is hidden, so it is asked for
 * again on every return. Where the API is missing or refused (an insecure
 * origin, battery saver) nothing happens — that is "where the browser allows".
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;
    let sentinel = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        // Refused: not an error the user can act on.
      }
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      sentinel?.release?.().catch(() => {});
    };
  }, [enabled]);
}

export const SWIPE_MIN_PX = 72;
export const SWIPE_MAX_MS = 700;

/** Is a touch that travelled (dx, dy) in `ms` a sideways flick? -1 = towards the left, 1 = right, 0 = no. */
export function swipeDirection(dx, dy, ms) {
  if (ms > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? -1 : 1;
}

/**
 * A one-finger sideways flick on `ref`'s element (spec req 12). Fingers only:
 * a pen is for writing and a mouse has the buttons. `ignore(target)` vetoes a
 * swipe that starts somewhere a drag means something else (a text field, the
 * ink page while a finger draws).
 */
export function useSwipe(ref, { onLeft, onRight, ignore, enabled = true }) {
  const handlers = useRef({});
  handlers.current = { onLeft, onRight, ignore };

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return undefined;
    let start = null;

    const down = (event) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) {
        start = null;
        return;
      }
      if (handlers.current.ignore?.(event.target)) {
        start = null;
        return;
      }
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
    };
    const up = (event) => {
      if (!start || event.pointerId !== start.id) return;
      const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, event.timeStamp - start.at);
      start = null;
      if (direction < 0) handlers.current.onLeft?.();
      else if (direction > 0) handlers.current.onRight?.();
    };
    const cancel = () => {
      start = null;
    };

    // Capture: the ink canvas stops propagation of the pointer events it handles.
    node.addEventListener('pointerdown', down, { capture: true, passive: true });
    node.addEventListener('pointerup', up, { capture: true, passive: true });
    node.addEventListener('pointercancel', cancel, { capture: true, passive: true });
    return () => {
      node.removeEventListener('pointerdown', down, { capture: true });
      node.removeEventListener('pointerup', up, { capture: true });
      node.removeEventListener('pointercancel', cancel, { capture: true });
    };
  }, [ref, enabled]);
}
