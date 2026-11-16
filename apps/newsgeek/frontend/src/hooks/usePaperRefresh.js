/**
 * Refresh the paper when the installed PWA comes back (SUITE_REVIEW_2026-11
 * NewsGeek finding 1) — without moving the reader.
 *
 *  - At the top of the page: refetch quietly; the new paper simply appears.
 *  - Scrolled down: never reorder under their thumb. `peek()` asks the
 *    gateway WITHOUT writing Apollo's cache (the list on screen stays put),
 *    and if it brings stories the reader doesn't have, `pending.count` says
 *    how many. The view shows NewStoriesBar; `showNew()` scrolls up and
 *    refetches.
 *
 * The resume detection itself is @geeksuite/ui's useRefetchOnResume
 * (visibility, focus, bfcache restore, back online — throttled).
 */
import { useCallback, useRef, useState } from 'react';
import { useRefetchOnResume } from '@geeksuite/ui';
import { useScrollRoot } from './scrollRoot';

/** Two minutes: a paper doesn't change faster, and a quick app switch shouldn't cost a read. */
export const PAPER_RESUME_MIN_MS = 2 * 60 * 1000;

/** How many of `fresh` ids the reader does not already have. */
export function countNew(fresh, have) {
  if (!Array.isArray(fresh)) return 0;
  const seen = new Set(have);
  return fresh.filter((id) => !seen.has(id)).length;
}

/**
 * @param {{ refetch: () => Promise<unknown>, peek: () => Promise<string[]|null>,
 *   currentIds: string[], enabled?: boolean, minIntervalMs?: number }} opts
 */
export function usePaperRefresh({ refetch, peek, currentIds, enabled = true, minIntervalMs = PAPER_RESUME_MIN_MS }) {
  const { atTop, toTop } = useScrollRoot();
  const [pending, setPending] = useState(null);
  const ids = useRef(currentIds);
  ids.current = currentIds;

  const onResume = useCallback(async () => {
    try {
      if (atTop()) {
        setPending(null);
        await refetch();
        return;
      }
      const fresh = await peek();
      const count = countNew(fresh, ids.current);
      if (count > 0) setPending({ count });
    } catch {
      // A background refresh that fails leaves the paper as it was; the
      // reader's own actions (Retry, Older stories) report failures.
    }
  }, [atTop, peek, refetch]);

  const markFresh = useRefetchOnResume(onResume, { enabled, minIntervalMs });

  const showNew = useCallback(() => {
    toTop();
    setPending(null);
    markFresh();
    return refetch().catch(() => {});
  }, [markFresh, refetch, toTop]);

  return { pending, showNew, markFresh };
}
