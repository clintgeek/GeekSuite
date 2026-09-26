/**
 * The Settings route's state: the Send-to-device form (Kindle address, device
 * word), custom shelves, the three import jobs (Goodreads CSV, Goodreads
 * dedupe, Calibre rescan — bookgeek's own `/api/import/*`), and the AI status
 * check. The preferences (default shelf, library assistant) are session-level
 * and come from hooks/useAppSettings.js through the shared provider.
 *
 * Returned under the prop names `SettingsView` has always taken.
 */
import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { GET_AI_STATUS } from "../graphql/queries.js";
import { ADD_BOOK_SHELF, REMOVE_BOOK_SHELF, SAVE_BOOK_PROFILE } from "../graphql/mutations.js";
import { authFetch } from "../utils/authFetch";
import { refreshShelfSummary } from "./useBookActions";

/** One `/api/import/*` job: loading, error, summary, run. */
function useImportJob(path, failure) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  async function run(body) {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const res = await authFetch(path, { method: "POST", ...(body ? { body } : {}) });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message || json?.message || failure);
      }
      setSummary(json.data || {});
    } catch (err) {
      setError(err.message || failure);
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, setError, summary, setSummary, run };
}

export function useSettings({ session, params }) {
  const apolloClient = useApolloClient();
  const { profile, setProfile, profileLoading, setProfileLoading, profileError, setProfileError, profileLoadedAt, shelves } = session;
  const prefs = session.settings;

  const [kindleEmailInput, setKindleEmailInput] = useState(profile?.kindleEmail || "");
  const [deviceWordInput, setDeviceWordInput] = useState(profile?.deviceWord || "");
  const [profileMessage, setProfileMessage] = useState(null);

  // Reseed the form when the profile (re)loads.
  useEffect(() => {
    if (!profileLoadedAt) return;
    setKindleEmailInput(profile?.kindleEmail || "");
    setDeviceWordInput(profile?.deviceWord || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a (re)load, not on every profile write
  }, [profileLoadedAt]);

  const [newShelfLabel, setNewShelfLabel] = useState("");
  const [shelfEditLoading, setShelfEditLoading] = useState(false);
  const [shelfEditError, setShelfEditError] = useState(null);

  const [goodreadsFile, setGoodreadsFile] = useState(null);
  const goodreadsImport = useImportJob("/import/goodreads", "Goodreads import failed");
  const goodreadsDedupe = useImportJob("/import/goodreads/dedupe", "Goodreads dedupe failed");
  const calibreRescan = useImportJob("/import/calibre/rescan?limit=5000", "Library rescan failed");

  const [aiStatus, setAiStatus] = useState(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [aiStatusError, setAiStatusError] = useState(null);

  async function handleSaveProfile(event) {
    event.preventDefault();
    setProfileLoading(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const { data } = await apolloClient.mutate({
        mutation: SAVE_BOOK_PROFILE,
        variables: {
          input: {
            kindleEmail: kindleEmailInput.trim() || null,
            deviceWord: deviceWordInput.trim().toLowerCase(),
          },
        },
      });

      const saved = data?.saveBookProfile || null;
      setProfile(saved);
      setKindleEmailInput(saved?.kindleEmail || "");
      setDeviceWordInput(saved?.deviceWord || "");
      setProfileMessage("Profile saved");
    } catch (err) {
      setProfileError(err.message || "Failed to save profile");
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleAddCustomShelf(event) {
    if (event?.preventDefault) event.preventDefault();
    const label = newShelfLabel.trim();
    if (!label) return;
    setShelfEditLoading(true);
    setShelfEditError(null);
    try {
      const { data } = await apolloClient.mutate({
        mutation: ADD_BOOK_SHELF,
        variables: { label },
      });
      setProfile(data?.addBookShelf || null);
      setNewShelfLabel("");
    } catch (err) {
      setShelfEditError(err.message || "Failed to add shelf");
    } finally {
      setShelfEditLoading(false);
    }
  }

  async function handleDeleteCustomShelf(shelfId) {
    const shelf = shelves.find((s) => s.id === shelfId);
    const ok = window.confirm(
      `Remove the shelf "${shelf?.label || shelfId}"? Books on it go back to Unread.`
    );
    if (!ok) return;
    setShelfEditLoading(true);
    setShelfEditError(null);
    try {
      const { data } = await apolloClient.mutate({
        mutation: REMOVE_BOOK_SHELF,
        variables: { id: shelfId },
      });
      setProfile(data?.removeBookShelf?.profile || null);
      const shelves = params.lib.state.filter.shelves;
      if (shelves.includes(shelfId)) params.lib.update({ shelves: shelves.filter((s) => s !== shelfId) });
      await prefs.resetDefaultShelfIf(shelfId);
      await refreshShelfSummary(apolloClient);
    } catch (err) {
      setShelfEditError(err.message || "Failed to remove shelf");
    } finally {
      setShelfEditLoading(false);
    }
  }

  function handleGoodreadsFileChange(event) {
    const file = event.target.files && event.target.files[0];
    setGoodreadsFile(file || null);
    goodreadsImport.setError(null);
    goodreadsImport.setSummary(null);
  }

  async function handleGoodreadsImport(event) {
    event.preventDefault();
    if (!goodreadsFile) {
      goodreadsImport.setError("Select your Goodreads library CSV export file first.");
      return;
    }
    const formData = new FormData();
    formData.append("file", goodreadsFile);
    await goodreadsImport.run(formData);
  }

  async function handleCheckAiStatus() {
    setAiStatusLoading(true);
    setAiStatusError(null);
    try {
      const { data } = await apolloClient.query({ query: GET_AI_STATUS, fetchPolicy: "no-cache" });
      setAiStatus(data?.bookAiStatus || null);
    } catch (err) {
      setAiStatusError(err.message || "Failed to load AI status");
    } finally {
      setAiStatusLoading(false);
    }
  }

  return {
    aiStatus,
    aiStatusError,
    aiStatusLoading,
    handleCheckAiStatus,

    calibreRescanError: calibreRescan.error,
    calibreRescanLoading: calibreRescan.loading,
    calibreRescanSummary: calibreRescan.summary,
    handleCalibreRescan: () => calibreRescan.run(),

    goodreadsDedupeError: goodreadsDedupe.error,
    goodreadsDedupeLoading: goodreadsDedupe.loading,
    goodreadsDedupeSummary: goodreadsDedupe.summary,
    handleGoodreadsDedupe: () => goodreadsDedupe.run(),

    goodreadsFile,
    goodreadsImportError: goodreadsImport.error,
    goodreadsImportLoading: goodreadsImport.loading,
    goodreadsImportSummary: goodreadsImport.summary,
    handleGoodreadsFileChange,
    handleGoodreadsImport,

    kindleEmailInput,
    setKindleEmailInput,
    deviceWordInput,
    setDeviceWordInput,
    profileError,
    profileLoading,
    profileMessage,
    handleSaveProfile,

    newShelfLabel,
    setNewShelfLabel,
    shelfEditError,
    shelfEditLoading,
    handleAddCustomShelf,
    handleDeleteCustomShelf,

    defaultShelfPref: prefs.defaultShelfPref,
    setDefaultShelfPref: prefs.setDefaultShelfPref,
    handleSaveDefaultShelf: prefs.handleSaveDefaultShelf,
    libraryAssistantPref: prefs.libraryAssistantPref,
    libraryAssistantSaving: prefs.libraryAssistantSaving,
    handleToggleLibraryAssistant: prefs.handleToggleLibraryAssistant,
    prefSaveError: prefs.prefSaveError,
    prefSaveLoading: prefs.prefSaveLoading,
    prefSaveMessage: prefs.prefSaveMessage,
  };
}
