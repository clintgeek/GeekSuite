import { useEffect, useSyncExternalStore } from 'react';

/**
 * One offline message at a time (review 2026-11-27).
 *
 * The app-wide indicator (a chip and a banner) and the add-food box both said
 * "you're offline" at once, in different words, one over the other. A screen
 * that says it itself — in the place the person is looking — claims the
 * message with `useSaysOffline(true)`, and the app-wide indicator stays quiet
 * for as long as that claim is held.
 */
let claims = 0;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** While `active`, this screen is the one saying "offline". */
export function useSaysOffline(active) {
  useEffect(() => {
    if (!active) return undefined;
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, [active]);
}

/** Is some screen already saying it? */
export function useOfflineSaidElsewhere() {
  return useSyncExternalStore(subscribe, () => claims > 0, () => false);
}
