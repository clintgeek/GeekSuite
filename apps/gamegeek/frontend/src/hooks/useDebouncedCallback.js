import { useEffect, useMemo, useRef } from 'react';

/**
 * A stable debounced wrapper around `fn`. The latest `fn` is always the one
 * called; pending calls flush on unmount so a half-typed save is not lost.
 */
export function useDebouncedCallback(fn, delay = 350) {
  const fnRef = useRef(fn);
  const timer = useRef(null);
  const pending = useRef(null);
  fnRef.current = fn;

  const debounced = useMemo(() => {
    const call = (...args) => {
      pending.current = args;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const a = pending.current;
        pending.current = null;
        if (a) fnRef.current(...a);
      }, delay);
    };
    call.flush = () => {
      clearTimeout(timer.current);
      const a = pending.current;
      pending.current = null;
      if (a) fnRef.current(...a);
    };
    call.cancel = () => {
      clearTimeout(timer.current);
      pending.current = null;
    };
    return call;
  }, [delay]);

  useEffect(() => () => debounced.flush(), [debounced]);
  return debounced;
}
