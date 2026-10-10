import { useCallback, useMemo } from 'react';
import { normalizeTag, normalizeTags } from '@geeksuite/tags';
import useTodoPreferences from './useTodoPreferences';

/**
 * usePinnedTags — the tag chips Chef pins above every view.
 *
 * Stored in TodoGeek's slice of the suite preference store,
 * `User.appPreferences.todogeek.pinnedTags` (an array of tag strings), through
 * `useTodoPreferences` → `@geeksuite/user` → `PATCH
 * /api/users/preferences/todogeek`. That route MERGES the fields it is sent
 * into the stored bag (`setAppPreferences`), so writing `{ pinnedTags }`
 * never touches `aiReviewDraft` or anything else there. The bag is free-form,
 * so nothing on the server changed.
 *
 * Pins are spelled in the suite tag standard (`@geeksuite/tags`, 2026-10-01):
 * a pin stored before it (`geekSuite`) reads as `geek-suite`, and is written
 * that way the next time the pins change. No migration needed for the bag.
 */
export function normalizePinned(value) {
  if (!Array.isArray(value)) return [];
  return normalizeTags(value.map((raw) => String(raw ?? ''))).slice(0, 12);
}

export default function usePinnedTags() {
  const { pinnedTags: raw, setPinnedTags: write, loaded } = useTodoPreferences();
  const pinned = useMemo(() => normalizePinned(raw), [raw]);

  const setPinned = useCallback((next) => write(normalizePinned(next)), [write]);

  const toggle = useCallback((tag) => {
    const key = normalizeTag(String(tag));
    const has = pinned.includes(key);
    return setPinned(has ? pinned.filter((t) => t !== key) : [...pinned, key]);
  }, [pinned, setPinned]);

  return { pinned, setPinned, toggle, loaded };
}
