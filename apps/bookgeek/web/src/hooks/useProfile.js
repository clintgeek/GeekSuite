/**
 * The signed-in user's bookgeek Profile — Kindle address, device word, custom
 * shelves — from the gateway's `bookProfile` (per-user; see CONTEXT.md
 * "Which calls go where"). Session-level: the shelf list every picker reads
 * is built from it, the device-basket dialog reads the device word, and
 * Settings edits it.
 */
import { useEffect, useMemo, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { GET_BOOK_PROFILE } from "../graphql/queries.js";

// Built-in shelves. The user's custom shelves (from their profile) are
// appended; see `shelves` below.
const GENERIC_SHELF_PILL =
  "rounded-full border border-stone-500/70 bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-900 dark:bg-stone-900/40 dark:text-stone-200";

export const BUILT_IN_SHELVES = [
  { id: "all", label: "All books" },
  { id: "reading", label: "Reading", pillClass: "rounded-full border border-amber-500/70 bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { id: "on-reader", label: "On Reader", pillClass: "rounded-full border border-teal-500/70 bg-teal-100 px-1.5 py-0.5 text-[9px] font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-200" },
  { id: "unread", label: "Unread", pillClass: "rounded-full border border-slate-500/70 bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-900 dark:bg-slate-900/40 dark:text-slate-200" },
  { id: "read", label: "Read", pillClass: "rounded-full border border-sky-500/70 bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" },
  { id: "want-to-read", label: "Want to read", pillClass: "rounded-full border border-violet-500/70 bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200" },
  { id: "abandoned", label: "Abandoned", pillClass: "rounded-full border border-rose-500/70 bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-900 dark:bg-rose-900/40 dark:text-rose-200" },
  { id: "need-to-find", label: "Need to find", pillClass: "rounded-full border border-orange-500/70 bg-orange-100 px-1.5 py-0.5 text-[9px] font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-200" },
];

/** Built-in shelves plus the user's custom ones, in the one list every picker, pill and filter reads. */
export function composeShelves(customShelves) {
  return [
    ...BUILT_IN_SHELVES,
    ...(customShelves || []).map((s) => ({
      id: s.id,
      label: s.label,
      pillClass: GENERIC_SHELF_PILL,
      custom: true,
    })),
  ];
}

export function useProfile() {
  const apolloClient = useApolloClient();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  // Bumped when the profile (re)loads, so Settings can reseed its form.
  const [profileLoadedAt, setProfileLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    apolloClient
      .query({ query: GET_BOOK_PROFILE, fetchPolicy: "no-cache" })
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data?.bookProfile || null);
        setProfileLoadedAt(Date.now());
      })
      .catch((err) => {
        if (!cancelled) setProfileError(err.message || "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apolloClient]);

  const customShelves = useMemo(
    () => (Array.isArray(profile?.customShelves) ? profile.customShelves : []),
    [profile]
  );
  const shelves = useMemo(() => composeShelves(customShelves), [customShelves]);

  return {
    profile,
    setProfile,
    profileLoading,
    setProfileLoading,
    profileError,
    setProfileError,
    profileLoadedAt,
    customShelves,
    shelves,
  };
}
