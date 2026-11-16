/**
 * Where the reader was on each page, for Back (SUITE_REVIEW_2026-11
 * NewsGeek finding 2). Kept in sessionStorage — per tab, gone when the tab
 * is — because a story opened in this window unloads NewsGeek: Back is then
 * a fresh page load (or a bfcache restore, which needs nothing from us).
 *
 * Two things per page, keyed by path + query (`/everything?section=tech`):
 *  - `scroll` — the <main> scrollTop (AppMain saves and restores it);
 *  - `count`  — how many stories Everything had loaded ("Older stories"
 *    grows it), so a reload after Back asks for that many again instead of
 *    one page, and the saved scroll position has stories under it.
 *
 * Storage can throw (private mode, quota, blocked): every access is guarded
 * and a failure just means "nothing remembered".
 */
const PREFIX = 'newsgeek.place:';

export const placeKey = (location) => `${location.pathname}${location.search || ''}`;

function read(key) {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, patch) {
  try {
    const next = { ...(read(key) || {}), ...patch };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(next));
  } catch {
    /* nothing remembered */
  }
}

export const readScroll = (key) => {
  const v = read(key)?.scroll;
  return Number.isFinite(v) && v > 0 ? v : 0;
};
export const writeScroll = (key, scroll) => write(key, { scroll: Math.max(0, Math.round(scroll)) });

export const readCount = (key) => {
  const v = read(key)?.count;
  return Number.isInteger(v) && v > 0 ? v : 0;
};
export const writeCount = (key, count) => write(key, { count });

/** How long a restore waits for the stories to render before settling for what fits. */
export const RESTORE_WAIT_MS = 4000;
const RESTORE_STEP_MS = 100;

/**
 * Scroll `node` to `target` once the page is tall enough to hold it (the
 * list may still be loading). Stops as soon as the reader touches, wheels or
 * types — their scroll wins — and after RESTORE_WAIT_MS goes as far as it
 * can. Returns a cancel function.
 */
export function restoreScroll(node, target, { waitMs = RESTORE_WAIT_MS } = {}) {
  let done = false;
  let timer = null;
  const start = Date.now();
  const stop = () => {
    done = true;
    if (timer) clearTimeout(timer);
    for (const ev of ['touchstart', 'wheel', 'keydown', 'pointerdown']) node.removeEventListener(ev, stop);
  };
  for (const ev of ['touchstart', 'wheel', 'keydown', 'pointerdown']) node.addEventListener(ev, stop, { passive: true });
  const attempt = () => {
    if (done) return;
    const max = node.scrollHeight - node.clientHeight;
    if (max >= target) {
      node.scrollTop = target;
      stop();
      return;
    }
    if (Date.now() - start >= waitMs) {
      if (max > 0) node.scrollTop = max;
      stop();
      return;
    }
    timer = setTimeout(attempt, RESTORE_STEP_MS);
  };
  attempt();
  return stop;
}
