import { useCallback } from 'react';
import { useAppPreferences } from '@geeksuite/user';

/**
 * useTodoPreferences — TodoGeek's own slice of the suite's per-app preference
 * store.
 *
 * There is no todogeek preference store to invent: `@geeksuite/user` already
 * keeps a namespaced, server-persisted bag per app
 * (`User.appPreferences.todogeek`, `PATCH /api/users/preferences/todogeek`),
 * bootstrapped for this app by `AppBootstrapper`. Theme goes through the
 * suite-global `preferences` and reminders are a per-browser permission, which
 * is why neither of them appears here — this is for settings that are about
 * *todogeek*, follow the user between devices, and that the gateway may also
 * need to read.
 *
 * `pinnedTags` (2026-09-29) is the second: the tag chips pinned above every
 * view, an array of strings.
 *
 * `aiReviewDraft` is the first: the opt-in for the AI weekly review draft
 * (DOCS/AI_IDEAS.md #1). Default OFF, and off means off on both ends — the
 * `reviewDraft` resolver reads the same preference and will not consult a
 * model without it, so a client bug cannot spend a call.
 */
export const TODO_APP = 'todogeek';

const NO_TAGS = Object.freeze([]);

export default function useTodoPreferences() {
  const { preferences, updateAppPreferences, loaded, loading } = useAppPreferences(TODO_APP);

  const setAiReviewDraft = useCallback(
    (on) => updateAppPreferences({ aiReviewDraft: Boolean(on) }),
    [updateAppPreferences]
  );

  // Pinned tag chips (usePinnedTags). Partial write: the PATCH merges.
  const setPinnedTags = useCallback(
    (tags) => updateAppPreferences({ pinnedTags: tags }),
    [updateAppPreferences]
  );

  return {
    loaded,
    loading,
    // Absent means off. A preference that has never been written must read as
    // opted out, never as "unknown, try it and see".
    aiReviewDraft: preferences?.aiReviewDraft === true,
    setAiReviewDraft,
    pinnedTags: Array.isArray(preferences?.pinnedTags) ? preferences.pinnedTags : NO_TAGS,
    setPinnedTags,
  };
}
