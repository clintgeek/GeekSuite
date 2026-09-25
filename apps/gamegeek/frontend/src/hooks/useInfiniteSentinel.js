import { useEffect, useRef } from 'react';

/**
 * Calls `onMore` when the sentinel scrolls within `rootMargin` of view — at
 * most once per load.
 *
 * The ref guard is the point: an IntersectionObserver can report the same
 * intersection twice (a layout shift, StrictMode's double effect), and two
 * fetchMore calls for one page append it twice. The guard is released when
 * `busy` drops, and the observer is re-created then, which makes it report
 * its CURRENT state once — so a short last page that leaves the sentinel on
 * screen still loads the next one instead of waiting for a scroll.
 *
 * `root` is the scroll container (an observer on the viewport cannot look
 * ahead past an overflow container's clip).
 */
export function useInfiniteSentinel(onMore, { enabled = true, busy = false, root = null, rootMargin = '600px' } = {}) {
  const ref = useRef(null);
  const guard = useRef(false);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    if (!busy) guard.current = false;
  }, [busy]);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || busy || !node || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (guard.current) return;
        guard.current = true;
        Promise.resolve(onMoreRef.current?.()).catch(() => {
          guard.current = false;
        });
      },
      { root, rootMargin }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [enabled, busy, root, rootMargin]);

  return ref;
}
