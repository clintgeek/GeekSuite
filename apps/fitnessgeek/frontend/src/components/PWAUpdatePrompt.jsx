import React from 'react';
import { registerSW } from 'virtual:pwa-register';

// How often a long-open tab asks the server whether a new version exists.
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Applies app updates only while the app is out of sight.
 *
 * FitnessGeek is open all day, and every push to main redeploys it. The old
 * behaviour reloaded the page as soon as a new version activated (autoUpdate),
 * and this component's snackbar also force-refreshed after 15s, so either way a
 * reload could land mid-way through logging a food (2026-09-27; see
 * DOCS/SIMPLE_AND_FULL_PLAN.md "Service worker").
 *
 * Now a new version downloads and WAITS. It's applied (SKIP_WAITING and a
 * reload) only when the page is hidden: switching apps, locking the phone,
 * or leaving the tab. The next time the app is looked at it's simply the new
 * version. A launch after every tab was closed picks it up on its own.
 * There's no UI and nothing to tap.
 */
export function useDeferredUpdate({ register = registerSW, doc = document } = {}) {
  React.useEffect(() => {
    let pending = false;
    let updateSW = null;
    const applyIfHidden = () => {
      if (pending && updateSW && doc.visibilityState === 'hidden') {
        pending = false;
        updateSW(true);
      }
    };
    let timer = null;
    updateSW = register({
      immediate: true,
      onNeedRefresh() {
        pending = true;
        applyIfHidden(); // already in the background: apply straight away
      },
      onRegisteredSW(_url, registration) {
        if (registration && typeof registration.update === 'function') {
          timer = setInterval(() => registration.update(), UPDATE_CHECK_MS);
        }
      },
    });
    doc.addEventListener('visibilitychange', applyIfHidden);
    return () => {
      doc.removeEventListener('visibilitychange', applyIfHidden);
      if (timer) clearInterval(timer);
    };
  }, [register, doc]);
}

const PWAUpdatePrompt = () => {
  useDeferredUpdate();
  return null;
};

export default PWAUpdatePrompt;
