import { useEffect, useState } from 'react';

/**
 * The local hour, re-read when the app comes back, so "Good morning" isn't
 * still on screen at lunch after a resume, and "What did you eat?" opens on
 * this hour's meal.
 */
export function useHourNow() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const check = () => setHour(new Date().getHours());
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);
  return hour;
}

export default useHourNow;
