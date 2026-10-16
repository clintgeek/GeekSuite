import { useState, useEffect } from 'react';

/**
 * Is the browser online? That is all this answers.
 *
 * There is no offline queue (review B17; deferred, Chef's call): an entry
 * made with no signal is not kept anywhere. The IndexedDB "pending log"
 * plumbing that used to live here had no callers and no service-worker
 * handler, so it only ever let the banner promise a sync that never happened.
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
};

export default useOnlineStatus;
