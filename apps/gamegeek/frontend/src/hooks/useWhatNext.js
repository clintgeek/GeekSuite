/**
 * The "what should I play" strip (DOCS/WHAT_NEXT_SPEC.md).
 *
 * Fetched once per mood, like BookGeek's: it is a suggestion rail, not live
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
  const { data, loading, error } = useQuery(GET_GAME_WHAT_NEXT, {
    variables: { limit: WHAT_NEXT_LIMIT, mood: mood || null },
    skip: !enabled,
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
  };
}
