/**
 * "The page is about to go away — save what you have."
 * (SUITE_REVIEW_2026-11 A4/A5, plan 2.2.)
 *
 * Two shared paths take the page away from under an app with no warning:
 *
 *   - the stale-bundle reload (`@geeksuite/api-client`, on
 *     GRAPHQL_VALIDATION_FAILED) — reason `'stale-bundle'`;
 *   - a session that is truly over (refresh answered 400/401/403): logout,
 *     then a redirect to the sign-in page, or the app unmounting under
 *     AuthProvider — reason `'session-ending'`.
 *
 * Either one used to lose an open editor or an unsent entry. Before acting,
 * the shared code now calls `runBeforeLeave(reason)`, which:
 *
 *   1. calls every handler registered with `onBeforeLeave(handler)`;
 *   2. dispatches a DOM event on `window` — `geeksuite:before-reload` or
 *      `geeksuite:session-ending` — whose `detail` is
 *      `{ reason, waitUntil(promise) }`, for code that would rather listen;
 *   3. waits for whatever they returned / passed to `waitUntil`, but never
 *      longer than LEAVE_HOOK_TIMEOUT_MS in all. A hook that hangs must not
 *      keep a dead session on screen or a broken bundle running.
 *
 * Handlers should do something quick and local — stash a draft in
 * IndexedDB or localStorage. The session may already be dead, so a network
 * save is not something to rely on here.
 *
 *   import { onBeforeLeave } from '@geeksuite/auth';
 *   useEffect(() => onBeforeLeave(() => saveDraftLocally(draft)), [draft]);
 *
 * Never throws; a failing handler is logged and skipped.
 */

export const BEFORE_RELOAD_EVENT = 'geeksuite:before-reload';
export const SESSION_ENDING_EVENT = 'geeksuite:session-ending';
export const LEAVE_HOOK_TIMEOUT_MS = 3000;

const EVENT_FOR_REASON = {
  'stale-bundle': BEFORE_RELOAD_EVENT,
  'session-ending': SESSION_ENDING_EVENT,
};

const handlers = new Set();

/**
 * Register `handler({ reason })`, called before a shared reload or
 * session-ending redirect. It may return a promise. Returns an unsubscribe.
 */
export function onBeforeLeave(handler) {
  if (typeof handler !== 'function') return () => {};
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

/**
 * Give the app its chance to save, then resolve. Resolves at once (well, on
 * the next microtask) when nobody is listening.
 *
 * @param {'stale-bundle'|'session-ending'} reason
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export function runBeforeLeave(reason, { timeoutMs = LEAVE_HOOK_TIMEOUT_MS } = {}) {
  const pending = [];
  const note = (value) => {
    if (value && typeof value.then === 'function') {
      pending.push(Promise.resolve(value).catch((err) => {
        console.warn('[geeksuite/auth] a before-leave hook failed', err);
      }));
    }
  };

  for (const handler of [...handlers]) {
    try {
      note(handler({ reason }));
    } catch (err) {
      console.warn('[geeksuite/auth] a before-leave hook failed', err);
    }
  }

  const eventName = EVENT_FOR_REASON[reason];
  const win = typeof window !== 'undefined' ? window : null;
  if (eventName && win && typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    try {
      win.dispatchEvent(new CustomEvent(eventName, {
        detail: { reason, waitUntil: note },
      }));
    } catch (err) {
      console.warn('[geeksuite/auth] before-leave event failed', err);
    }
  }

  if (pending.length === 0) return Promise.resolve();

  let timer = null;
  const cap = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  return Promise.race([Promise.all(pending), cap])
    .then(() => undefined)
    .finally(() => clearTimeout(timer));
}

/** Test hook. */
export function resetLeaveHooksForTests() {
  handlers.clear();
}
