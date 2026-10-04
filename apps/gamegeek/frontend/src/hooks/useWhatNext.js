/**
 * The "what should I play" strip (DOCS/WHAT_NEXT_SPEC.md).
 *
 * On demand (2026-10-03): nothing is asked until the sheet is first opened
 * (`openSheet`), so a library visit never spends a call on its own. After
 * that it is fetched once per mood, like BookGeek's: it is a suggestion rail, not live
 * data, so `cache-first` keeps it from spending the daily cap on every
 * filter change. The mood box is the only re-ask — an explicit submit
 * changes the variables, which is a new cache entry and a new answer.
 */
import { useState } from "react";
import { useQuery } from "@apollo/client";
import { GET_GAME_WHAT_NEXT } from "../graphql/queries";

export const WHAT_NEXT_LIMIT = 5;

export function useWhatNext({ enabled }) {
  const [mood, setMood] = useState(null);
  const [open, setOpen] = useState(false);
  // Latches on the first open: closing the sheet keeps the answer, and
  // re-opening reads it from the cache instead of asking again.
  const [asked, setAsked] = useState(false);
  const { data, loading, error } = useQuery(GET_GAME_WHAT_NEXT, {
    variables: { limit: WHAT_NEXT_LIMIT, mood: mood || null },
    skip: !enabled || !asked,
    fetchPolicy: "cache-first",
  });

  /** The mood box: submit re-runs the strip; blank clears it. */
  const applyMood = (text) => {
    const clean = String(text ?? "").trim();
    setMood(clean || null);
  };

  const result = enabled ? data?.gameWhatNext : null;
  const picks = Array.isArray(result?.picks) ? result.picks.filter((p) => p?.game) : [];

  return {
    picks,
    provenance: result?.provenance || null,
    loading: Boolean(enabled && loading),
    error: enabled && error ? error.message || "Could not load suggestions." : null,
    mood,
    applyMood,
    open: Boolean(enabled && open),
    openSheet: () => {
      setAsked(true);
      setOpen(true);
    },
    closeSheet: () => setOpen(false),
  };
}
