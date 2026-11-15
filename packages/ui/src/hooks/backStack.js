/**
 * The history bookkeeping behind `useBackToClose` (review 3.27).
 *
 * Android's Back (button or edge swipe) is a history traversal. With nothing
 * in history for an open sheet, dialog, drawer or menu, Back left the page —
 * or closed the installed PWA — with the overlay still up. The fix is the
 * usual one: while an overlay is open it owns one history entry at the SAME
 * URL, so Back pops that entry instead of the page.
 *
 * The contract, entry by entry:
 *
 *   - Each open overlay pushes one entry. The entry's state is the previous
 *     state (so react-router's `usr`/`key`/`idx` ride along untouched and the
 *     router sees the same location) plus `__geekBack`: the ids of every
 *     overlay open at that depth, oldest first. Nested overlays therefore
 *     stack: [A], [A, B], …
 *
 *   - `popstate` lands on some entry. Every registered overlay whose id is
 *     not in that entry's list has lost its entry, so it is closed (newest
 *     first) with `onClose(event, 'backButton')`. A non-overlay entry (a
 *     router page) has an empty list, so it closes everything.
 *
 *   - Closing by any other means (Cancel, backdrop, Escape, unmount) takes the
 *     entry back off with `history.go(-n)` — but only while it is still on
 *     top. Closes are batched in a microtask, so a parent and child closing in
 *     one commit go back once by two, and React StrictMode's
 *     cleanup-then-rerun reuses the entry instead of pushing a second one.
 *
 *   - Close-then-navigate (`onClose(); navigate('/x')` in one handler): the
 *     router's push lands on top of the overlay's entry before React commits
 *     the close, so the entry is no longer on top and is left alone — going
 *     back would undo the navigation. It becomes an *orphan*: an overlay entry
 *     whose newest id is not open. When Back later lands on an orphan it is
 *     skipped with one more `history.back()`, so one Back from /x returns to
 *     the page the overlay was opened on, with no dead press in between. The
 *     same rule absorbs entries left by a reload while an overlay was open.
 *
 *   - Veto: if `onClose` declines to close (a dirty-form guard, a dialog with
 *     `disableClose`), the overlay is still registered a beat later and its
 *     entry is pushed again, so the next Back still lands on the overlay.
 *
 * Known limit: navigating in a LATER tick than the close (after an await, in
 * the narrow window before our `go(-n)` traversal finishes) can be undone by
 * that traversal. Close and navigate in the same handler.
 */

export const BACK_STATE_KEY = '__geekBack';

const VETO_RECHECK_MS = 80;

const idsOf = (state) =>
  state && typeof state === 'object' && Array.isArray(state[BACK_STATE_KEY]) ? state[BACK_STATE_KEY] : [];

/**
 * @param {Window} win anything with `history` (pushState/go/back/state) and
 *   `addEventListener('popstate')`; tests pass a fake.
 */
export function createBackStack(win, { vetoRecheckMs = VETO_RECHECK_MS } = {}) {
  /** id -> { id, onClose, popped } for every overlay currently open. */
  const open = new Map();
  /** ids closed by other means, waiting for the microtask flush. */
  const pending = new Set();
  let flushQueued = false;
  let listening = false;
  let seq = 0;

  const currentState = () => {
    const s = win.history.state;
    return s && typeof s === 'object' ? s : {};
  };

  const push = (id) => {
    const base = currentState();
    win.history.pushState({ ...base, [BACK_STATE_KEY]: [...idsOf(base), id] }, '');
  };

  const isLive = (id) => {
    const entry = open.get(id);
    return Boolean(entry && !entry.popped);
  };

  const onPop = (event) => {
    const landed = idsOf(event && 'state' in event ? event.state : win.history.state);
    // Newest first, so a child's onClose runs before its parent's.
    const gone = [...open.values()].filter((e) => !e.popped && !landed.includes(e.id)).reverse();
    for (const entry of gone) {
      entry.popped = true;
      try {
        entry.onClose?.(event);
      } finally {
        setTimeout(() => {
          // Still registered and still marked popped: onClose said no.
          if (open.get(entry.id) === entry && entry.popped) {
            entry.popped = false;
            push(entry.id);
          }
        }, vetoRecheckMs);
      }
    }
    const top = landed[landed.length - 1];
    if (top !== undefined && !isLive(top)) {
      // An orphan (see the header): skip it.
      win.history.back();
    }
  };

  const flush = () => {
    flushQueued = false;
    if (!pending.size) return;
    const landed = idsOf(win.history.state);
    let n = 0;
    for (let i = landed.length - 1; i >= 0 && pending.has(landed[i]); i -= 1) n += 1;
    pending.clear();
    if (n) win.history.go(-n);
  };

  return {
    /**
     * Register an open overlay; returns its id. Pass the id from the previous
     * registration to reuse an entry whose close has not flushed yet.
     */
    register(previousId, onClose) {
      if (!listening) {
        win.addEventListener('popstate', onPop);
        listening = true;
      }
      if (previousId != null && pending.has(previousId)) {
        pending.delete(previousId);
        open.set(previousId, { id: previousId, onClose, popped: false });
        return previousId;
      }
      seq += 1;
      const id = `b${seq}`;
      open.set(id, { id, onClose, popped: false });
      push(id);
      return id;
    },

    /** The overlay closed (or unmounted, or opted out). */
    release(id) {
      const entry = open.get(id);
      if (!entry) return;
      open.delete(id);
      if (entry.popped) return; // Back already took its entry.
      pending.add(id);
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(flush);
      }
    },

    /** Test hook: how many overlays are registered. */
    get size() {
      return open.size;
    },
  };
}

let shared = null;

/** The one stack for this window, or null where there is no history API. */
export function getBackStack() {
  if (shared) return shared;
  if (typeof window === 'undefined' || !window.history || typeof window.history.pushState !== 'function') {
    return null;
  }
  shared = createBackStack(window);
  return shared;
}

/** Tests only: forget the shared stack (its listener stays on the old window). */
export function resetBackStackForTests() {
  shared = null;
}
