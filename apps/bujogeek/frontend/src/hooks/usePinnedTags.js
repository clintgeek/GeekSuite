import { useCallback, useMemo } from 'react';
import useBujoPreferences from './useBujoPreferences';

/**
 * usePinnedTags — the tag chips Chef pins above every view.
 *
 * Stored in BuJoGeek's slice of the suite preference store,
 * `User.appPreferences.bujogeek.pinnedTags` (an array of tag strings), through
 * `useBujoPreferences` → `@geeksuite/user` → `PATCH
 * /api/users/preferences/bujogeek`. That route MERGES the fields it is sent
 * into the stored bag (`setAppPreferences`), so writing `{ pinnedTags }`
 * never touches `aiReviewDraft` or anything else there. The bag is free-form,
 * so nothing on the server changed.
 *
 * Tags keep the case they were first pinned with; comparison is
 * case-insensitive, like tag filtering.
 */
export function normalizePinned(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const tag = String(raw ?? '').replace(/^#/, '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 12);
}

export default function usePinnedTags() {
  const { pinnedTags: raw, setPinnedTags: write, loaded } = useBujoPreferences();
  const pinned = useMemo(() => normalizePinned(raw), [raw]);

  const setPinned = useCallback((next) => write(normalizePinned(next)), [write]);

  const toggle = useCallback((tag) => {
    const key = String(tag).toLowerCase();
    const has = pinned.some((t) => t.toLowerCase() === key);
    return setPinned(has ? pinned.filter((t) => t.toLowerCase() !== key) : [...pinned, tag]);
  }, [pinned, setPinned]);

  return { pinned, setPinned, toggle, loaded };
}
