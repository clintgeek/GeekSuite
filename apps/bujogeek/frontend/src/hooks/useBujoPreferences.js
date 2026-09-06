import { useCallback } from 'react';
import { useAppPreferences } from '@geeksuite/user';

/**
 * useBujoPreferences — BuJoGeek's own slice of the suite's per-app preference
 * store.
 *
 * There is no bujogeek preference store to invent: `@geeksuite/user` already
 * keeps a namespaced, server-persisted bag per app
 * (`User.appPreferences.bujogeek`, `PATCH /api/users/preferences/bujogeek`),
 * bootstrapped for this app by `AppBootstrapper`. Theme goes through the
 * suite-global `preferences` and reminders are a per-browser permission, which
 * is why neither of them appears here — this is for settings that are about
 * *bujogeek*, follow the user between devices, and that the gateway may also
 * need to read.
 *
 * `aiReviewDraft` is the first: the opt-in for the AI weekly review draft
 * (DOCS/AI_IDEAS.md #1). Default OFF, and off means off on both ends — the
 * `reviewDraft` resolver reads the same preference and will not consult a
 * model without it, so a client bug cannot spend a call.
 */
export const BUJO_APP = 'bujogeek';

export default function useBujoPreferences() {
  const { preferences, updateAppPreferences, loaded, loading } = useAppPreferences(BUJO_APP);

  const setAiReviewDraft = useCallback(
    (on) => updateAppPreferences({ aiReviewDraft: Boolean(on) }),
    [updateAppPreferences]
  );

  return {
    loaded,
    loading,
    // Absent means off. A preference that has never been written must read as
    // opted out, never as "unknown, try it and see".
    aiReviewDraft: preferences?.aiReviewDraft === true,
    setAiReviewDraft,
  };
}
