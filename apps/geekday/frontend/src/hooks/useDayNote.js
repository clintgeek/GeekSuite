import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useApolloClient } from '@apollo/client';
import { dayNoteStore, releaseDayNoteStores, unsavedDayNoteStores } from '../data/dayNoteStore.js';

/** The ink page for `dayKey`: its state and the store that saves it. */
export function useDayNote(dayKey) {
  const client = useApolloClient();
  const store = useMemo(() => dayNoteStore(client, dayKey), [client, dayKey]);
  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    releaseDayNoteStores(dayKey);
  }, [dayKey]);

  return { state, store };
}

/**
 * App-wide care for unsaved ink, on any day: retry when the network returns,
 * and ask before the tab is closed while something is still unsaved.
 */
export function useUnsavedInkGuard() {
  useEffect(() => {
    const retry = () => unsavedDayNoteStores().forEach((store) => store.retryNow());
    const warn = (event) => {
      if (!unsavedDayNoteStores().length) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('online', retry);
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('beforeunload', warn);
    };
  }, []);
}
