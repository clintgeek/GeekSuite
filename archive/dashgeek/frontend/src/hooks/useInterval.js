import { useEffect, useRef } from 'react';

/**
 * useInterval — fire `callback` every `ms` milliseconds.
 *
 * Uses a ref so the interval doesn't reset on every render just
 * because `callback` changed identity (common when the callback
 * closes over state setters).
 *
 * @param {Function} callback  The function to run on each tick.
 * @param {number|null} ms     Delay in ms. Pass `null` to pause.
 * @param {boolean} immediate  If true (default), runs the callback
 *                             once synchronously on mount before the
 *                             first interval tick.
 */
export default function useInterval(callback, ms, immediate = true) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (ms == null) return undefined;
    const tick = () => savedCallback.current?.();
    if (immediate) tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms, immediate]);
}
