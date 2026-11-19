/**
 * A page can lend the top bar a better title than the route's (navConfig):
 * the thing page names the thing once its own heading has scrolled away.
 *
 * The top bar and the page are siblings in the shell, so this is a tiny
 * external store, not context. Each title is tied to the path that set it,
 * so a page that forgets to clear never names the next page.
 */
import { useEffect, useSyncExternalStore } from 'react';

let current = null; // { path, title }
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function setPageTitle(path, title) {
  const next = title ? { path, title } : null;
  if (current?.path === next?.path && current?.title === next?.title) return;
  current = next;
  emit();
}

export function clearPageTitle(path) {
  if (current && current.path === path) {
    current = null;
    emit();
  }
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = () => current;

/** The title a page lent for `path`, or null. */
export function usePageTitle(path) {
  const lent = useSyncExternalStore(subscribe, snapshot, snapshot);
  return lent && lent.path === path ? lent.title : null;
}

/**
 * Lend `title` to the top bar while `target` (an element) is scrolled out of
 * view above `root` — or under a sticky bar `topInset` px tall. Clears on leave.
 */
export function useTitleWhenScrolledPast(path, title, target, root, topInset = 0) {
  useEffect(() => {
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Gone off the TOP (not merely below the fold).
        const above = !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
        setPageTitle(path, above ? title : null);
      },
      { root: root ?? null, threshold: 0, rootMargin: `-${topInset}px 0px 0px 0px` }
    );
    io.observe(target);
    return () => {
      io.disconnect();
      clearPageTitle(path);
    };
  }, [path, title, target, root, topInset]);
}
