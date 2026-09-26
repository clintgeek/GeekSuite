/**
 * BookGeek's app preferences — `appPreferences.bookgeek` via
 * `useAppPreferences("bookgeek")` → `PATCH /api/users/preferences/bookgeek`:
 *
 *   - `defaultShelfFilter`: the shelf the library opens on. Applied once per
 *     session, and only when the URL names no shelf — a link to
 *     `/?shelf=read` means Read, whatever the default says.
 *   - `libraryAssistant`: the one switch for the What-next shelf and the
 *     metadata draft (DOCS/AI_IDEAS.md #4). Anything but an explicit `true`
 *     is off.
 *
 * Session-level (hooks/useBookGeek.jsx): Settings writes these and the
 * library and the detail sheet read them.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppPreferences } from "@geeksuite/user";
import { hasShelfParam } from "../utils/libraryParams";

export function useAppSettings({ params }) {
  const { preferences: appPrefs, updateAppPreferences, loaded: appPrefsLoaded } = useAppPreferences("bookgeek");
  const location = useLocation();
  const [prefSaveLoading, setPrefSaveLoading] = useState(false);
  const [prefSaveError, setPrefSaveError] = useState(null);
  const [prefSaveMessage, setPrefSaveMessage] = useState(null);
  const [defaultShelfPref, setDefaultShelfPref] = useState("all");
  const [libraryAssistantPref, setLibraryAssistantPref] = useState(false);
  const [libraryAssistantSaving, setLibraryAssistantSaving] = useState(false);
  const defaultShelfAppliedRef = useRef(false);
  // The URL as the session found it: a deep link's shelf beats the default.
  const initialSearchRef = useRef(location.search);

  const { setShelfFilter } = params;
  useEffect(() => {
    if (!appPrefsLoaded) return;
    const preferredShelf = appPrefs?.defaultShelfFilter;
    if (typeof preferredShelf === "string" && preferredShelf) {
      setDefaultShelfPref(preferredShelf);
      if (!defaultShelfAppliedRef.current) {
        defaultShelfAppliedRef.current = true;
        if (!hasShelfParam(initialSearchRef.current)) setShelfFilter(preferredShelf);
      }
    }
    // Anything but an explicit `true` is off — an absent key, a stale
    // string, a half-written preference document.
    setLibraryAssistantPref(appPrefs?.libraryAssistant === true);
  }, [appPrefsLoaded, appPrefs, setShelfFilter]);

  function clearPrefMessages() {
    setPrefSaveError(null);
    setPrefSaveMessage(null);
  }

  async function handleSaveDefaultShelf() {
    setPrefSaveLoading(true);
    clearPrefMessages();
    try {
      await updateAppPreferences({ defaultShelfFilter: defaultShelfPref });
      setPrefSaveMessage("Saved default shelf preference.");
    } catch (err) {
      setPrefSaveError(err?.message || "Failed to save preference.");
    } finally {
      setPrefSaveLoading(false);
    }
  }

  /** Returns the saved value, so the caller can drop what the switch gated. */
  async function handleToggleLibraryAssistant(next) {
    const value = Boolean(next);
    setLibraryAssistantSaving(true);
    clearPrefMessages();
    // Optimistic: the switch is the whole feature's gate, and a stuck switch
    // reads as a broken feature. A failed save puts it straight back.
    setLibraryAssistantPref(value);
    try {
      await updateAppPreferences({ libraryAssistant: value });
      setPrefSaveMessage(value ? "Library assistant on." : "Library assistant off.");
      return value;
    } catch (err) {
      setLibraryAssistantPref(!value);
      setPrefSaveError(err?.message || "Failed to save preference.");
      return !value;
    } finally {
      setLibraryAssistantSaving(false);
    }
  }

  /** A deleted custom shelf that was the default: reset it, and persist that. */
  async function resetDefaultShelfIf(shelfId) {
    if (defaultShelfPref !== shelfId) return;
    setDefaultShelfPref("all");
    // …and persist it. Resetting only the in-memory value left the deleted
    // shelf id in stored preferences, so the next reload put the user back on
    // a shelf that no longer exists — a permanently empty library with no
    // explanation.
    await updateAppPreferences({ defaultShelfFilter: "all" }).catch(() => {});
  }

  return {
    defaultShelfPref,
    setDefaultShelfPref,
    libraryAssistantPref,
    libraryAssistantSaving,
    prefSaveLoading,
    prefSaveError,
    prefSaveMessage,
    handleSaveDefaultShelf,
    handleToggleLibraryAssistant,
    resetDefaultShelfIf,
  };
}
