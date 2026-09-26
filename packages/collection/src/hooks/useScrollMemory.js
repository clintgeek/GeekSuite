/**
 * Remember where a list was scrolled, per view, and put the reader back there
 * when they return (from Settings, or back/forward onto a filter they had
 * scrolled).
 *
 *   useScrollMemory(scrollRoot, codec.toParams(state).toString(),
 *                   { rows, hasMore, storageKey: 'gamegeek.libraryScroll' })
 *
 *   - Positions live in sessionStorage under `storageKey` (per tab, gone when
 *     it closes), keyed by the view — pass the codec's own query string, so
 *     foreign params (an Add sheet's) are not part of the key and opening a
 *     sheet over the list changes nothing.
 *   - A view with no remembered position starts at the top: a new filter is a
 *     new list, not the old one's scroll offset.
 *   - Restoring waits for enough rows: it scrolls as far as it can, which
 *     brings the infinite-scroll sentinel into view, the next page loads, and
 *     it tries again — until it lands or the list runs out. A wheel or touch
 *     from the reader cancels it; their scroll wins.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

const MAX_VIEWS = 20;

function readAll(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

function remember(storageKey, key, top, maxViews) {
  try {
    const map = readAll(storageKey);
    delete map[key];
    map[key] = Math.round(top);
    const keys = Object.keys(map);
    keys.slice(0, Math.max(0, keys.length - maxViews)).forEach((k) => delete map[k]);
    window.sessionStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* a convenience, not state */
  }
}

/** The remembered position for `key` under `storageKey` (0 when none). */
export function savedScroll(storageKey, key) {
  const top = readAll(storageKey)[key];
  return Number.isFinite(top) ? top : 0;
}

export function useScrollMemory(root, key, { rows = 0, hasMore = false, storageKey = 'collection.scroll', maxViews = MAX_VIEWS } = {}) {
  const target = useRef(null);
  const shownKey = useRef(null);

  // A new view (or the first render): decide where it should sit.
  useLayoutEffect(() => {
    if (!root || shownKey.current === key) return;
    shownKey.current = key;
    const saved = savedScroll(storageKey, key);
    target.current = saved > 0 ? saved : null;
    if (!target.current) root.scrollTop = 0;
  }, [root, key, storageKey]);

  // Try to land on the remembered position as rows arrive.
  useLayoutEffect(() => {
    if (!root || target.current == null || !rows) return;
    const max = root.scrollHeight - root.clientHeight;
    if (max >= target.current - 1 || !hasMore) {
      root.scrollTop = Math.min(target.current, Math.max(0, max));
      target.current = null;
    } else {
      root.scrollTop = max;
    }
  }, [root, key, rows, hasMore]);

  // Keep the position current, and let the reader cancel a restore.
  useEffect(() => {
    if (!root) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (target.current != null) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => remember(storageKey, key, root.scrollTop, maxViews));
    };
    const cancel = () => {
      target.current = null;
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('wheel', cancel, { passive: true });
    root.addEventListener('touchstart', cancel, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('wheel', cancel);
      root.removeEventListener('touchstart', cancel);
    };
  }, [root, key, storageKey, maxViews]);
}
