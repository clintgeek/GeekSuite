/**
 * The What-next shelf (DOCS/AI_IDEAS.md #4, stream R117).
 *
 * On demand (2026-10-03): nothing is asked until the sheet is first opened
 * (`openWhatNext`), so a library visit never spends a call on its own. After
 * that it is fetched once per session per switch-on: it is a suggestion, not live
 * data, and refetching it on every filter change would spend the daily cap on
 * a shelf nobody asked to change. The Apollo cache is what makes it "once":
 * `cache-first`, and the answer stays until the switch goes off (evicted in
 * useBookGeek's toggle) or the session ends (the store is cleared on sign-out).
 * An error is never cached, so the next mount tries again — a failed
 * suggestion strip must never look like a failed library.
 */
import { useState } from "react";
import { useApolloClient, useQuery } from "@apollo/client";
import { GET_WHAT_NEXT } from "../graphql/queries.js";

export const WHAT_NEXT_LIMIT = 5;

/** Forget the cached strip, so the next switch-on asks again. */
export function evictWhatNext(cache) {
  cache.evict({ id: "ROOT_QUERY", fieldName: "whatNext" });
  cache.gc();
}

export function useWhatNext({ enabled, onUpdateShelf }) {
  const client = useApolloClient();
  const [startingBookId, setStartingBookId] = useState(null);
  const [mood, setMood] = useState(null);
  const [whatNextOpen, setWhatNextOpen] = useState(false);
  // Latches on the first open: closing the sheet keeps the answer, and
  // re-opening reads it from the cache instead of asking again.
  const [asked, setAsked] = useState(false);
  const { data, loading, error } = useQuery(GET_WHAT_NEXT, {
    variables: { limit: WHAT_NEXT_LIMIT, mood: mood || null },
    skip: !enabled || !asked,
    fetchPolicy: "cache-first",
  });

  /** The mood box: submit re-runs the strip; blank clears it. */
  const applyMood = (text) => {
    const clean = String(text ?? "").trim();
    setMood(clean || null);
  };

  const result = enabled ? data?.whatNext : null;
  const whatNextPicks = Array.isArray(result?.picks) ? result.picks.filter((p) => p?.book) : [];

  /** "Start reading" on a suggestion: the ordinary shelf mutation, nothing else. */
  async function onStartReading(book) {
    if (!book) return;
    const bookId = book.id || book._id;
    setStartingBookId(bookId);
    try {
      const moved = await onUpdateShelf(book, "reading");
      // It is on the Reading shelf now, so it is no longer a suggestion.
      if (moved !== false) {
        client.cache.modify({
          id: "ROOT_QUERY",
          fields: {
            whatNext(existing) {
              if (!existing?.picks) return existing;
              return { ...existing, picks: existing.picks.filter((p) => p.bookId !== bookId) };
            },
          },
        });
      }
    } finally {
      setStartingBookId(null);
    }
  }

  return {
    whatNextEnabled: Boolean(enabled),
    whatNextOpen: Boolean(enabled && whatNextOpen),
    openWhatNext: () => {
      setAsked(true);
      setWhatNextOpen(true);
    },
    closeWhatNext: () => setWhatNextOpen(false),
    whatNextPicks,
    whatNextProvenance: result?.provenance || null,
    whatNextLoading: Boolean(enabled && loading),
    whatNextError: enabled && error ? error.message || "Could not load suggestions." : null,
    onStartReading,
    startingBookId,
    mood,
    applyMood,
  };
}
