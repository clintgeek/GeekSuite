/**
 * The "is anyone signed in?" check behind AuthProvider, with no React in it.
 *
 * ## Why (2026-10-16, REVIEW_2026-10 B2)
 *
 * AuthProvider used to treat any failed `/api/me` as "no user". The fleet
 * restarts on every push to main, phones drop signal, and a 502 or a timeout
 * then looked exactly like being signed out: ProtectedRoute sent Heather to
 * the sign-in page in the middle of a deploy.
 *
 * Now only `getMe()` answering null — a 401 that survived one refresh — means
 * signed out. Any other failure keeps the user we last knew (in memory, or
 * the cached copy from authClient's readCachedUser) and tries again: after
 * RETRY_DELAYS_MS, then whenever the page comes back to the front or the
 * phone gets signal back.
 */

import { readCachedUser, writeCachedUser, clearCachedUser } from './authClient.js';

export const RETRY_DELAYS_MS = [2000, 5000, 15000];

/**
 * @param {object} opts
 * @param {() => Promise<object|null>} opts.getMe
 * @param {(user: object) => void} opts.onUser          – a user is known (fresh or cached)
 * @param {() => void} opts.onSignedOut                  – the session is over
 * @param {(problem: boolean) => void} opts.onConnectionProblem
 * @param {() => void} [opts.onSettled]                  – the first answer is in (either way)
 * @param {number[]} [opts.delays]
 * @param {Function} [opts.setTimer]
 * @param {Function} [opts.clearTimer]
 */
export function createSessionKeeper({
  getMe,
  onUser,
  onSignedOut,
  onConnectionProblem,
  onSettled,
  delays = RETRY_DELAYS_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let stopped = false;
  let attempt = 0;
  let timerId = null;
  let inFlight = false;
  let problem = false;
  let settled = false;
  let removeListeners = null;

  function settle() {
    if (settled) return;
    settled = true;
    onSettled?.();
  }

  function setProblem(next) {
    if (problem === next) return;
    problem = next;
    onConnectionProblem?.(next);
  }

  function clearRetry() {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  async function check() {
    if (stopped || inFlight) return;
    inFlight = true;
    clearRetry();
    try {
      const me = await getMe();
      if (stopped) return;
      attempt = 0;
      setProblem(false);
      if (me) {
        writeCachedUser(me);
        onUser(me);
      } else {
        clearCachedUser();
        onSignedOut();
      }
    } catch {
      if (stopped) return;
      // Not a verdict on the session: keep whoever we knew.
      const cached = readCachedUser();
      if (cached) onUser(cached);
      setProblem(true);
      if (attempt < delays.length) {
        const ms = delays[attempt];
        attempt += 1;
        timerId = setTimer(() => {
          timerId = null;
          check();
        }, ms);
      }
      // Out of timed retries: the foreground/online listeners take over.
    } finally {
      inFlight = false;
      if (!stopped) settle();
    }
  }

  /** Retry now, but only while there is a problem to retry. */
  function retryIfProblem() {
    if (problem) check();
  }

  function addListeners() {
    const win = typeof window !== 'undefined' ? window : null;
    const doc = typeof document !== 'undefined' ? document : null;
    const onVisibility = () => {
      if (doc && doc.visibilityState && doc.visibilityState !== 'visible') return;
      retryIfProblem();
    };
    const onOnline = () => retryIfProblem();
    try {
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', onVisibility);
      }
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('online', onOnline);
      }
    } catch {
      // ignore
    }
    return () => {
      try {
        if (doc && typeof doc.removeEventListener === 'function') {
          doc.removeEventListener('visibilitychange', onVisibility);
        }
        if (win && typeof win.removeEventListener === 'function') {
          win.removeEventListener('online', onOnline);
        }
      } catch {
        // ignore
      }
    };
  }

  return {
    start() {
      removeListeners = addListeners();
      return check();
    },
    /** Ask again now (e.g. a "Try again" button). */
    retry() {
      attempt = 0;
      return check();
    },
    stop() {
      stopped = true;
      clearRetry();
      if (removeListeners) {
        removeListeners();
        removeListeners = null;
      }
    },
  };
}
