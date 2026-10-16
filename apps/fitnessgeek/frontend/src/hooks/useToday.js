import { useEffect, useState } from 'react';
import { localDateString } from '@geeksuite/utils';

/**
 * Today's local calendar date (YYYY-MM-DD), kept current.
 *
 * An installed PWA can sit in Android's recents overnight with its JS alive,
 * so a date computed at mount is yesterday by breakfast. This re-reads it
 * when the app comes back to the foreground, on focus, and at local midnight.
 */
export function useToday() {
  const [today, setToday] = useState(() => localDateString());

  useEffect(() => {
    const check = () => {
      const now = localDateString();
      setToday((prev) => (prev === now ? prev : now));
    };

    let timer;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => { check(); scheduleMidnight(); }, next - now);
    };
    scheduleMidnight();

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);

  return today;
}

export default useToday;
