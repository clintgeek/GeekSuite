import { useCallback, useState } from 'react';

/**
 * An open/closed choice remembered on this device (localStorage).
 *
 * A per-browser convenience, never the source of truth for anything: every
 * access is wrapped, because private windows and blocked site data throw, and
 * the disclosure must still open and close when they do.
 */
const read = (key, initial) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === '1' ? true : raw === '0' ? false : initial;
  } catch {
    return initial;
  }
};

export function useRememberedOpen(key, initial = false) {
  const [open, setOpen] = useState(() => read(key, initial));
  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // Convenience only.
    }
  }, [key, open]);
  return [open, toggle];
}

export default useRememberedOpen;
