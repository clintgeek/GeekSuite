import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import { Box } from "@mui/material";
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from "@geeksuite/auth";
import { useUser, usePreferences, useAppPreferences, useThemeMode } from "@geeksuite/user";
import { registerReset, reset as resetUserStore } from "./utils/resetUserStore";
import { LoginSplash } from "@geeksuite/ui";
import { useApolloClient } from "@apollo/client";
import { GET_BOOKS, GET_SHELVES } from "./graphql/queries.js";
import { UPDATE_BOOK, DELETE_BOOK, CREATE_BOOK } from "./graphql/mutations.js";
import { GeekShell, GeekAppFrame, GeekFab } from "@geeksuite/ui";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { API_BASE } from "./utils/bookDisplay";
import LibraryView from "./views/LibraryView";
import SettingsView from "./views/SettingsView";
import BookDetailModal from "./views/BookDetailModal";
import ReaderModal from "./views/ReaderModal";
import AddBookDialog from "./views/AddBookDialog";
import DeviceBasketDialog from "./views/DeviceBasketDialog";

let INCLUDE_CREDENTIALS = false;
if (typeof window !== "undefined") {
  const origin = window.location.origin.replace(/\/$/, "");
  INCLUDE_CREDENTIALS = API_BASE.startsWith(`${ origin }/api`);
}

// Built-in shelves. The user's custom shelves (from their profile) are
// appended inside the component; see `shelves` below.
const GENERIC_SHELF_PILL =
  "rounded-full border border-stone-500/70 bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-900 dark:bg-stone-900/40 dark:text-stone-200";

const BUILT_IN_SHELVES = [
  { id: "all", label: "All books" },
  { id: "reading", label: "Reading", pillClass: "rounded-full border border-amber-500/70 bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { id: "on-reader", label: "On Reader", pillClass: "rounded-full border border-teal-500/70 bg-teal-100 px-1.5 py-0.5 text-[9px] font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-200" },
  { id: "unread", label: "Unread", pillClass: "rounded-full border border-slate-500/70 bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-900 dark:bg-slate-900/40 dark:text-slate-200" },
  { id: "read", label: "Read", pillClass: "rounded-full border border-sky-500/70 bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" },
  { id: "want-to-read", label: "Want to read", pillClass: "rounded-full border border-violet-500/70 bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200" },
  { id: "abandoned", label: "Abandoned", pillClass: "rounded-full border border-rose-500/70 bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium text-rose-900 dark:bg-rose-900/40 dark:text-rose-200" },
  { id: "need-to-find", label: "Need to find", pillClass: "rounded-full border border-orange-500/70 bg-orange-100 px-1.5 py-0.5 text-[9px] font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-200" },
];

export default function App() {
  const apolloClient = useApolloClient();
  const { bootstrap, reset: resetUser } = useUser();
  const { preferences, loaded: prefsLoaded } = usePreferences();
  const { preferences: appPrefs, updateAppPreferences, loaded: appPrefsLoaded } = useAppPreferences("bookgeek");
  const [health, setHealth] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [aiStatusError, setAiStatusError] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [convertingFormat, setConvertingFormat] = useState(null);

  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [shelfFilter, setShelfFilter] = useState("all");
  const [total, setTotal] = useState(0);
  const [shelfSummary, setShelfSummary] = useState(null);

  const [savedFilters, setSavedFilters] = useState([]);
  const [savedFiltersLoading, setSavedFiltersLoading] = useState(false);
  const [savedFiltersError, setSavedFiltersError] = useState(null);
  const [saveFilterLoading, setSaveFilterLoading] = useState(false);
  const [saveFilterError, setSaveFilterError] = useState(null);
  const [deleteFilterLoadingId, setDeleteFilterLoadingId] = useState(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [kindleEmailInput, setKindleEmailInput] = useState("");
  const [deviceWordInput, setDeviceWordInput] = useState("");
  const [profileMessage, setProfileMessage] = useState(null);

  const [newShelfLabel, setNewShelfLabel] = useState("");
  const [shelfEditLoading, setShelfEditLoading] = useState(false);
  const [shelfEditError, setShelfEditError] = useState(null);

  // Built-in shelves plus the signed-in user's custom shelves, in one list
  // every shelf picker, pill, and filter reads from.
  const customShelves = useMemo(
    () => (Array.isArray(profile?.customShelves) ? profile.customShelves : []),
    [profile]
  );
  const shelves = useMemo(
    () => [
      ...BUILT_IN_SHELVES,
      ...customShelves.map((s) => ({
        id: s.id,
        label: s.label,
        pillClass: GENERIC_SHELF_PILL,
        custom: true,
      })),
    ],
    [customShelves]
  );

  const [goodreadsFile, setGoodreadsFile] = useState(null);
  const [goodreadsImportLoading, setGoodreadsImportLoading] = useState(false);
  const [goodreadsImportError, setGoodreadsImportError] = useState(null);
  const [goodreadsImportSummary, setGoodreadsImportSummary] = useState(null);

  const [goodreadsDedupeLoading, setGoodreadsDedupeLoading] = useState(false);
  const [goodreadsDedupeError, setGoodreadsDedupeError] = useState(null);
  const [goodreadsDedupeSummary, setGoodreadsDedupeSummary] = useState(null);

  const [calibreRescanLoading, setCalibreRescanLoading] = useState(false);
  const [calibreRescanError, setCalibreRescanError] = useState(null);
  const [calibreRescanSummary, setCalibreRescanSummary] = useState(null);

  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState(null);
  const [enrichSummary, setEnrichSummary] = useState(null);

  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState(null);
  const [coverSearchResults, setCoverSearchResults] = useState(null);
  const [coverApplyLoadingId, setCoverApplyLoadingId] = useState(null);

  const [coverUploadFile, setCoverUploadFile] = useState(null);
  const [coverUploadLoading, setCoverUploadLoading] = useState(false);
  const [coverDeleteLoading, setCoverDeleteLoading] = useState(false);

  const [showCoverTools, setShowCoverTools] = useState(false);

  const [sendToKindleLoading, setSendToKindleLoading] = useState(false);
  const [sendToKindleStatus, setSendToKindleStatus] = useState(null);
  const [sendToKindleError, setSendToKindleError] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);

  const [shelfSavingId, setShelfSavingId] = useState(null);
  const [progressSavingId, setProgressSavingId] = useState(null);
  const [progressDraft, setProgressDraft] = useState("");
  const [progressError, setProgressError] = useState(null);
  const progressCommitRef = useRef(null);

  const [addBookOpen, setAddBookOpen] = useState(false);
  const [addBookLoading, setAddBookLoading] = useState(false);
  const [addBookError, setAddBookError] = useState(null);
  const [addBookTitle, setAddBookTitle] = useState("");
  const [addBookAuthors, setAddBookAuthors] = useState("");
  const [addBookIsbn, setAddBookIsbn] = useState("");
  const [addBookShelf, setAddBookShelf] = useState("want-to-read");
  const [addBookFile, setAddBookFile] = useState(null);

  const [selectedBookIds, setSelectedBookIds] = useState([]);
  const [mergeSelectionError, setMergeSelectionError] = useState(null);
  const [mergeLoading, setMergeLoading] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteIncludeFiles, setDeleteIncludeFiles] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [readerOpen, setReaderOpen] = useState(false);
  const [readerError, setReaderError] = useState(null);
  const { theme: suiteThemeMode } = useThemeMode();
  const [readerTheme, setReaderTheme] = useState(suiteThemeMode === "light" ? "light" : "dark");

  const [activeView, setActiveView] = useState("library");
  const [prefSaveLoading, setPrefSaveLoading] = useState(false);
  const [prefSaveError, setPrefSaveError] = useState(null);
  const [prefSaveMessage, setPrefSaveMessage] = useState(null);
  const [defaultShelfPref, setDefaultShelfPref] = useState("all");

  // Library bulk-select ("Select books…" in the filter sheet). It drives
  // `basketBookIds` — the list the device basket posts — and hides the FAB.
  const [selectMode, setSelectMode] = useState(false);

  // Device basket — session-local selection only
  const [basketBookIds, setBasketBookIds] = useState([]);
  const [basketLoading, setBasketLoading] = useState(false);
  const [basketError, setBasketError] = useState(null);
  const [basketResult, setBasketResult] = useState(null); // { slug, url, expiresAt }
  const [basketResultOpen, setBasketResultOpen] = useState(false);

  // Auto-clear the basket after 30 minutes without any basket interaction
  // (selection changes and basket creation both reset the timer).
  useEffect(() => {
    if (basketBookIds.length === 0) return undefined;
    const timer = setTimeout(() => {
      setBasketBookIds([]);
      setBasketError(null);
      setBasketResult(null);
      setBasketResultOpen(false);
    }, 30 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [basketBookIds, basketResult]);

  const bootstrapRanRef = useRef(false);
  const defaultShelfAppliedRef = useRef(false);

  useEffect(() => {
    registerReset(resetUser);
  }, [resetUser]);



  useEffect(() => {
    if (!user) {
      bootstrapRanRef.current = false;
      return;
    }
    if (sessionLoading) return;
    if (bootstrapRanRef.current) return;
    bootstrapRanRef.current = true;
    bootstrap().catch(() => { });
  }, [user, sessionLoading, bootstrap]);

  useEffect(() => {
    if (appPrefsLoaded) {
      const preferredShelf = appPrefs?.defaultShelfFilter;
      if (typeof preferredShelf === "string" && preferredShelf) {
        setDefaultShelfPref(preferredShelf);
        if (!defaultShelfAppliedRef.current) {
          setShelfFilter(preferredShelf);
          defaultShelfAppliedRef.current = true;
        }
      }
    }
  }, [appPrefsLoaded, appPrefs]);

  function clearPrefMessages() {
    setPrefSaveError(null);
    setPrefSaveMessage(null);
  }

  async function handleSaveDefaultShelf() {
    if (!user) {
      setPrefSaveError("Sign in to save preferences.");
      return;
    }
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

  const showMergeUi = false;

  const loadMoreRef = useRef(null);
  const readerContainerRef = useRef(null);
  const readerBookRef = useRef(null);
  const readerRenditionRef = useRef(null);

  function applySavedFilter(preset) {
    if (!preset) return;
    setSortBy(preset.sortBy || "title");
    setSortDir(preset.sortDir || "asc");
    setSearchQuery(preset.searchQuery || "");
    setAuthorFilter(preset.authorFilter || "");
    setTagFilter(preset.tagFilter || "");
    setShelfFilter(preset.shelfFilter || "all");
  }

  async function handleSaveCurrentFilter() {
    if (!token) {
      setSaveFilterError("Sign in to save filters.");
      return;
    }

    const hasAnyFilter =
      searchQuery.trim() ||
      authorFilter.trim() ||
      tagFilter.trim() ||
      shelfFilter !== "all";

    if (!hasAnyFilter) {
      setSaveFilterError("Adjust filters before saving a preset.");
      return;
    }

    const defaultName =
      searchQuery.trim() ||
      (shelfFilter !== "all"
        ? shelves.find((s) => s.id === shelfFilter)?.label || shelfFilter
        : "Library filter");

    // eslint-disable-next-line no-alert
    const name = window.prompt("Save filter as:", defaultName);
    if (!name || !name.trim()) {
      return;
    }

    setSaveFilterLoading(true);
    setSaveFilterError(null);
    try {
      const res = await authFetch("/profile/library-filters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          sortBy,
          sortDir,
          searchQuery,
          authorFilter,
          tagFilter,
          shelfFilter,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to save filter";
        throw new Error(message);
      }
      const filters = Array.isArray(json.data?.filters)
        ? json.data.filters
        : [];
      setSavedFilters(filters);
    } catch (err) {
      setSaveFilterError(err.message || "Failed to save filter");
    } finally {
      setSaveFilterLoading(false);
    }
  }

  async function handleCreateBook(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    if (!token) {
      setAddBookError("Sign in to add books.");
      return;
    }

    const title = addBookTitle.trim();
    if (!title) {
      setAddBookError("Title is required.");
      return;
    }

    setAddBookLoading(true);
    setAddBookError(null);
    try {
      const body = {
        title,
        authors: addBookAuthors
          .split(",")
          .map((a) => a.trim())
          .filter((a) => a.length > 0),
        isbn: addBookIsbn.trim() || undefined,
        shelf: addBookShelf || "want-to-read",
        owned: false,
      };

      const { data } = await apolloClient.mutate({
        mutation: CREATE_BOOK,
        variables: { input: body }
      });

      let created = data.createBook || null;

      if (created && (created.id || created._id) && addBookFile) {
        try {
          const formData = new FormData();
          formData.append("file", addBookFile);

          const uploadRes = await authFetch(`/books/${ (created.id || created._id) }/upload`, {
            method: "POST",
            body: formData,
          });
          const uploadJson = await uploadRes.json().catch(() => null);
          if (!uploadRes.ok || uploadJson?.success === false) {
            const message =
              uploadJson?.error?.message ||
              uploadJson?.message ||
              "Book created but failed to attach file";
            throw new Error(message);
          }

          const updated = uploadJson.data || null;
          if (updated && (updated.id || updated._id)) {
            created = updated;
          }
        } catch (uploadErr) {
          throw new Error(
            uploadErr.message || "Book created but failed to attach file"
          );
        }
      }

      setAddBookOpen(false);
      setAddBookTitle("");
      setAddBookAuthors("");
      setAddBookIsbn("");
      setAddBookShelf("want-to-read");
      setAddBookFile(null);

      // Reload first page with current filters
      await loadBooksPage(1, { append: false });

      if (created && (created.id || created._id)) {
        setSelectedBook(created);
      }
    } catch (err) {
      setAddBookError(err.message || "Failed to create book");
    } finally {
      setAddBookLoading(false);
    }
  }

  async function handleDeleteSavedFilter(id) {
    if (!token) {
      setSavedFiltersError("Sign in to modify saved filters.");
      return;
    }
    if (!id) return;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm("Delete this saved filter?");
    if (!confirmed) return;

    setDeleteFilterLoadingId(id);
    setSavedFiltersError(null);
    try {
      const res = await authFetch(`/profile/library-filters/${ encodeURIComponent(id) }`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to delete filter";
        throw new Error(message);
      }
      const filters = Array.isArray(json.data?.filters)
        ? json.data.filters
        : [];
      setSavedFilters(filters);
    } catch (err) {
      setSavedFiltersError(err.message || "Failed to delete filter");
    } finally {
      setDeleteFilterLoadingId(null);
    }
  }

  async function loadBooksPage(nextPage, { append } = { append: false }) {
    try {
      if (!token || !user) {
        if (!append) {
          setBooks([]);
          setTotal(0);
          setHasMore(false);
        }
        return;
      }

      if (!append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const pageToLoad =
        typeof nextPage === "number" && nextPage > 0 ? nextPage : 1;

      const variables = {
        page: pageToLoad,
        limit: 50,
        sort: sortBy || "title",
        sortDir: sortDir || "asc",
      };
      if (searchQuery.trim()) variables.q = searchQuery.trim();
      if (authorFilter.trim()) variables.author = authorFilter.trim();
      if (tagFilter.trim()) variables.tag = tagFilter.trim();
      if (shelfFilter !== "all") variables.shelf = shelfFilter;

      const [healthRes, apolloRes] = await Promise.all([
        fetch(`${ API_BASE }/health`, { cache: "no-store" }),
        apolloClient.query({
          query: GET_BOOKS,
          variables,
          fetchPolicy: "no-cache",
        }),
      ]);

      const healthJson = await healthRes.json().catch(() => null);
      const booksJson = apolloRes.data?.books || {};

      if (!healthRes.ok) {
        throw new Error(`Health check failed (${ healthRes.status })`);
      }

      setHealth(healthJson);

      const items = Array.isArray(booksJson.items) ? booksJson.items : [];
      if (append) {
        setBooks((prev) => [...prev, ...items]);
      } else {
        setBooks(items);
      }

      const totalCount =
        typeof booksJson.total === "number" ? booksJson.total : items.length;
      setTotal(totalCount);

      const pageSize =
        typeof booksJson.pageSize === "number"
          ? booksJson.pageSize
          : items.length;
      const currentPage =
        typeof booksJson.page === "number" ? booksJson.page : pageToLoad;
      setPage(currentPage);
      setHasMore(currentPage * pageSize < totalCount);
    } catch (err) {
      if (!append) {
        setError(err.message || "Failed to load data");
      } else {
        setError(err.message || "Failed to load more books");
      }
      setHasMore(false);
    } finally {
      if (!append) {
        setLoading(false);
      }
      setLoadingMore(false);
    }
  }

  function handleUploadFileChange(event) {
    const file = event.target.files && event.target.files[0];
    setUploadFile(file || null);
    setUploadError(null);
    setUploadMessage(null);
  }

  async function handleUploadBookFile(book) {
    if (!(book?.id || book?._id)) return;
    if (!token) {
      setUploadError("Sign in to attach files to books.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Choose a file to attach first.");
      return;
    }

    setUploadLoading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await authFetch(`/books/${ (book.id || book._id) }/upload`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to attach file";
        throw new Error(message);
      }

      const updated = json.data || null;
      if (updated && (updated.id || updated._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updated.id || updated._id) ? updated : b))
        );
        if (selectedBook && (selectedBook.id || selectedBook._id) === (updated.id || updated._id)) {
          setSelectedBook(updated);
        }
      }

      setUploadMessage("File attached to this book.");
      setUploadFile(null);
    } catch (err) {
      setUploadError(err.message || "Failed to attach file");
    } finally {
      setUploadLoading(false);
    }
  }

  async function authFetch(path, options = {}) {
    const url = path.startsWith("/") ? `${ API_BASE }${ path }` : `${ API_BASE }/${ path }`;

    const headers = { ...(options.headers || {}) };
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (res.status === 401) {
      handleLogout();
    }

    return res;
  }

  async function handleDownload(book, format) {
    if (!book || !(book.id || book._id)) return;

    const existingFile = (book.files || []).find(
      (f) => (f.format || "").toLowerCase() === format
    );

    setConvertingFormat(format);
    setDownloadOpen(false);

    try {
      const res = await authFetch(
        `/books/${ (book.id || book._id) }/download/${ format }`
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "Download failed");
        let message = "Download failed";
        try {
          const json = JSON.parse(text);
          message = json.error || json.message || message;
        } catch {
          message = text || message;
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (book.title || "book").replace(/[^a-zA-Z0-9 _.-]/g, "_");
      a.href = blobUrl;
      a.download = `${ safeTitle }.${ format }`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setConvertingFormat(null);
    }
  }

  async function loadSavedFilters() {
    if (!token) {
      setSavedFilters([]);
      return;
    }
    setSavedFiltersLoading(true);
    setSavedFiltersError(null);
    try {
      const res = await authFetch("/profile/library-filters");
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to load saved filters";
        throw new Error(message);
      }
      const filters = Array.isArray(json.data) ? json.data : [];
      setSavedFilters(filters);
    } catch (err) {
      setSavedFiltersError(err.message || "Failed to load saved filters");
    } finally {
      setSavedFiltersLoading(false);
    }
  }

  function toggleBookSelection(bookId, event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    setMergeSelectionError(null);
    setSelectedBookIds((prev) => {
      if (prev.includes(bookId)) {
        return prev.filter((id) => id !== bookId);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, bookId];
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token || !user) {
        setBooks([]);
        setTotal(0);
        setHasMore(false);
        setLoading(false);
        return;
      }

      await loadBooksPage(1, { append: false });

      try {
        const shelvesRes = await apolloClient.query({
          query: GET_SHELVES,
          fetchPolicy: "no-cache",
        });
        if (!cancelled && shelvesRes.data?.shelves) {
          setShelfSummary(shelvesRes.data.shelves);
        }
      } catch {
        // ignore shelf errors for now
      }
    }

    setPage(1);
    setHasMore(true);
    run();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    user,
    sortBy,
    sortDir,
    searchQuery,
    authorFilter,
    tagFilter,
    shelfFilter,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const me = await getMe();
        if (cancelled) return;

        if (me) {
          setUser(me);
          setToken("session");
          startRefreshTimer(() => {
            setUser(null);
            setToken(null);
          });
        } else {
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setError(err?.message || "Failed to load session");
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
      stopRefreshTimer();
    };
  }, []);

  useEffect(() => {
    return onLogout(() => {
      resetUserStore();
      setToken(null);
      setUser(null);
      setAiStatus(null);
      setAiStatusError(null);
      setProfile(null);
      setSavedFilters([]);
      stopRefreshTimer();
      bootstrapRanRef.current = false;
      defaultShelfAppliedRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setSavedFilters([]);
      return;
    }
    let cancelled = false;
    async function run() {
      await loadSavedFilters();
      if (cancelled) return;
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!token) {
        setProfile(null);
        setKindleEmailInput("");
        setDeviceWordInput("");
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      setProfileMessage(null);

      try {
        const res = await authFetch("/profile/me");
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.success !== false) {
          const data = json.data || null;
          setProfile(data);
          setKindleEmailInput(data?.kindleEmail || "");
          setDeviceWordInput(data?.deviceWord || "");
        } else if (!cancelled && !res.ok) {
          setProfileError(
            json?.error?.message || json?.message || "Failed to load profile"
          );
        }
      } catch (err) {
        if (!cancelled) {
          setProfileError(err.message || "Failed to load profile");
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    // Reset per-book enrichment status when switching books or closing modal
    setEnrichError(null);
    setEnrichSummary(null);
    setEnrichLoading(false);
    setCoverSearchQuery(
      selectedBook && typeof selectedBook.title === "string"
        ? selectedBook.title
        : ""
    );
    setCoverSearchError(null);
    setCoverSearchResults(null);
    setCoverSearchLoading(false);
    setCoverApplyLoadingId(null);
    setCoverUploadFile(null);
    setCoverUploadLoading(false);
    setCoverDeleteLoading(false);
    setShowCoverTools(false);
  }, [selectedBook]);

  useEffect(() => {
    if (!readerOpen || !(selectedBook?.id || selectedBook?._id) || !readerContainerRef.current) {
      return;
    }

    let cancelled = false;

    async function loadEpub() {
      try {
        setReaderError(null);

        const hasEpub =
          Array.isArray(selectedBook.files) &&
          selectedBook.files.some((file) => {
            const fmt = String(file.format || "").toLowerCase();
            if (fmt === "epub") return true;
            const path = String(file.path || "");
            const ext = path.includes(".")
              ? path.split(".").pop().toLowerCase()
              : "";
            return ext === "epub";
          });

        if (!hasEpub) {
          setReaderError("No EPUB format available for this book.");
          return;
        }

        const url = `${ API_BASE }/books/${ (selectedBook.id || selectedBook._id) }/download/epub`;
        const book = ePub(url, { openAs: "epub" });
        readerBookRef.current = book;
        // epub.js never rejects `book.opened` on a failed open — it only emits
        // `openFailed` — so without this the `display()` below hangs forever
        // and the reader shows a blank page with no error.
        book.on("openFailed", (openErr) => {
          if (!cancelled) {
            setReaderError(openErr?.message || "Could not open this EPUB.");
          }
        });

        const rendition = book.renderTo(readerContainerRef.current, {
          width: "100%",
          height: "100%",
        });
        readerRenditionRef.current = rendition;

        const readerTextSelectors =
          "body, p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code, em, strong, a, small, label, input, textarea, select, table, td, th, dd, dt, figcaption, section, article, main, aside, nav, header, footer, hr";

        if (rendition.themes) {
          rendition.themes.register("light", {
            [readerTextSelectors]: {
              color: "#1f2937 !important",
              "background-color": "transparent !important",
            },
            "body": {
              "background-color": "#f6f1e7 !important",
            },
            "a, a:link, a:visited, a:hover, a:active": {
              color: "#2563eb !important",
            },
          });

          rendition.themes.register("dark", {
            [readerTextSelectors]: {
              color: "#e2e8f0 !important",
              "background-color": "transparent !important",
            },
            "body": {
              "background-color": "#0f172a !important",
            },
            "a, a:link, a:visited, a:hover, a:active": {
              color: "#60a5fa !important",
            },
          });
        }

        await rendition.display();

        if (rendition.themes?.select) {
          rendition.themes.select(readerTheme);
        }
      } catch (err) {
        if (!cancelled) {
          setReaderError(err?.message || "Failed to load EPUB for this book.");
        }
      }
    }

    loadEpub();

    return () => {
      cancelled = true;
      if (
        readerRenditionRef.current &&
        typeof readerRenditionRef.current.destroy === "function"
      ) {
        try {
          readerRenditionRef.current.destroy();
        } catch {
          // ignore
        }
      }
      readerRenditionRef.current = null;

      if (
        readerBookRef.current &&
        typeof readerBookRef.current.destroy === "function"
      ) {
        try {
          readerBookRef.current.destroy();
        } catch {
          // ignore
        }
      }
      readerBookRef.current = null;
    };
  }, [readerOpen, selectedBook?.id || selectedBook?._id]);

  useEffect(() => {
    if (readerRenditionRef.current?.themes?.select) {
      readerRenditionRef.current.themes.select(readerTheme);
    }
  }, [readerTheme]);

  function apiErrorMessage(json, fallback) {
    if (typeof json?.error === "string") return json.error;
    return json?.error?.message || json?.message || fallback;
  }

  async function refreshShelfSummary() {
    try {
      const shelvesRes = await apolloClient.query({
        query: GET_SHELVES,
        fetchPolicy: "network-only",
      });
      if (shelvesRes.data?.shelves) {
        setShelfSummary(shelvesRes.data.shelves);
      }
    } catch {
      // counts are cosmetic; ignore refresh errors
    }
  }

  async function handleAddCustomShelf(event) {
    if (event?.preventDefault) event.preventDefault();
    const label = newShelfLabel.trim();
    if (!label) return;
    if (!token) {
      setShelfEditError("Sign in to add shelves.");
      return;
    }
    setShelfEditLoading(true);
    setShelfEditError(null);
    try {
      const res = await authFetch("/profile/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(apiErrorMessage(json, "Failed to add shelf"));
      }
      setProfile(json.data || null);
      setNewShelfLabel("");
    } catch (err) {
      setShelfEditError(err.message || "Failed to add shelf");
    } finally {
      setShelfEditLoading(false);
    }
  }

  async function handleDeleteCustomShelf(shelfId) {
    if (!token) {
      setShelfEditError("Sign in to remove shelves.");
      return;
    }
    const shelf = shelves.find((s) => s.id === shelfId);
    const ok = window.confirm(
      `Remove the shelf "${shelf?.label || shelfId}"? Books on it go back to Unread.`
    );
    if (!ok) return;
    setShelfEditLoading(true);
    setShelfEditError(null);
    try {
      const res = await authFetch(`/profile/shelves/${encodeURIComponent(shelfId)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(apiErrorMessage(json, "Failed to remove shelf"));
      }
      setProfile(json.data || null);
      if (shelfFilter === shelfId) setShelfFilter("all");
      if (defaultShelfPref === shelfId) setDefaultShelfPref("all");
      await refreshShelfSummary();
    } catch (err) {
      setShelfEditError(err.message || "Failed to remove shelf");
    } finally {
      setShelfEditLoading(false);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (!token) {
      setProfileError("You must be signed in to save your profile.");
      return;
    }

    setProfileLoading(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const res = await authFetch("/profile/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kindleEmail: kindleEmailInput.trim() || null,
          deviceWord: deviceWordInput.trim().toLowerCase(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message ||
          (typeof json?.error === "string" ? json.error : null) ||
          json?.message ||
          "Failed to save profile";
        throw new Error(message);
      }

      setProfile(json.data || null);
      setKindleEmailInput(json.data?.kindleEmail || "");
      setDeviceWordInput(json.data?.deviceWord || "");
      setProfileMessage("Profile saved");
    } catch (err) {
      setProfileError(err.message || "Failed to save profile");
    } finally {
      setProfileLoading(false);
    }
  }

  function handleGoodreadsFileChange(event) {
    const file = event.target.files && event.target.files[0];
    setGoodreadsFile(file || null);
    setGoodreadsImportError(null);
    setGoodreadsImportSummary(null);
  }

  async function handleGoodreadsImport(event) {
    event.preventDefault();

    if (!token) {
      setGoodreadsImportError(
        "You must be signed in to import from Goodreads."
      );
      return;
    }

    if (!goodreadsFile) {
      setGoodreadsImportError(
        "Select your Goodreads library CSV export file first."
      );
      return;
    }

    setGoodreadsImportLoading(true);
    setGoodreadsImportError(null);
    setGoodreadsImportSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", goodreadsFile);

      const res = await authFetch("/import/goodreads", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Goodreads import failed";
        throw new Error(message);
      }

      const data = json.data || {};
      setGoodreadsImportSummary(data);
    } catch (err) {
      setGoodreadsImportError(err.message || "Goodreads import failed");
    } finally {
      setGoodreadsImportLoading(false);
    }
  }

  async function handleGoodreadsDedupe() {
    if (!token) {
      setGoodreadsDedupeError(
        "You must be signed in to merge Goodreads duplicates."
      );
      return;
    }

    setGoodreadsDedupeLoading(true);
    setGoodreadsDedupeError(null);
    setGoodreadsDedupeSummary(null);

    try {
      const res = await authFetch("/import/goodreads/dedupe", {
        method: "POST",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Goodreads dedupe failed";
        throw new Error(message);
      }

      const data = json.data || {};
      setGoodreadsDedupeSummary(data);
    } catch (err) {
      setGoodreadsDedupeError(err.message || "Goodreads dedupe failed");
    } finally {
      setGoodreadsDedupeLoading(false);
    }
  }

  async function handleCalibreRescan() {
    if (!token) {
      setCalibreRescanError(
        "You must be signed in to rescan the library."
      );
      return;
    }

    setCalibreRescanLoading(true);
    setCalibreRescanError(null);
    setCalibreRescanSummary(null);

    try {
      const res = await authFetch("/import/calibre/rescan?limit=5000", {
        method: "POST",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Library rescan failed";
        throw new Error(message);
      }

      const data = json.data || {};
      setCalibreRescanSummary(data);
    } catch (err) {
      setCalibreRescanError(err.message || "Library rescan failed");
    } finally {
      setCalibreRescanLoading(false);
    }
  }

  async function handleEnrichSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id)) return;
    if (!token) {
      setEnrichError("Sign in to enrich metadata.");
      return;
    }

    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichSummary(null);

    try {
      const res = await authFetch(`/books/${ (selectedBook.id || selectedBook._id) }/enrich`, {
        method: "POST",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Metadata enrichment failed";
        throw new Error(message);
      }

      const data = json.data || {};
      const updatedBook = data.book || null;
      const updatedFields = Array.isArray(data.updatedFields)
        ? data.updatedFields
        : [];

      if (updatedBook && (updatedBook.id || updatedBook._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updatedBook.id || updatedBook._id) ? updatedBook : b))
        );
        setSelectedBook(updatedBook);
      }

      if (updatedFields.length > 0) {
        setEnrichSummary(`Updated: ${ updatedFields.join(", ") }`);
      } else {
        setEnrichSummary("No changes were needed; metadata already populated.");
      }
    } catch (err) {
      setEnrichError(err.message || "Metadata enrichment failed");
    } finally {
      setEnrichLoading(false);
    }
  }

  async function handleSearchCoversForSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id)) return;
    if (!token) {
      setCoverSearchError("Sign in to search covers.");
      return;
    }

    const baseQuery =
      typeof coverSearchQuery === "string" && coverSearchQuery.trim()
        ? coverSearchQuery.trim()
        : typeof selectedBook.title === "string"
          ? selectedBook.title
          : "";

    if (!baseQuery) {
      setCoverSearchError("Add a title or search term first.");
      return;
    }

    setCoverSearchLoading(true);
    setCoverSearchError(null);

    try {
      const params = new URLSearchParams();
      params.set("q", baseQuery);

      const res = await authFetch(
        `/books/${ (selectedBook.id || selectedBook._id) }/search-covers?${ params.toString() }`,
        {
          method: "GET",
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Cover search failed";
        throw new Error(message);
      }

      const data = json.data || {};
      const candidates = Array.isArray(data.candidates)
        ? data.candidates
        : [];
      setCoverSearchResults(candidates);
      if (!candidates.length) {
        setCoverSearchError("No covers found from OpenLibrary.");
      }
    } catch (err) {
      setCoverSearchError(err.message || "Cover search failed");
      setCoverSearchResults([]);
    } finally {
      setCoverSearchLoading(false);
    }
  }

  async function handleApplyCoverCandidate(candidate) {
    if (!(selectedBook?.id || selectedBook?._id) || !candidate) return;
    if (!token) {
      setCoverSearchError("Sign in to change covers.");
      return;
    }

    const provider =
      typeof candidate.source === "string" ? candidate.source : "openlibrary";

    let body = { provider };
    if (provider === "openlibrary") {
      const coverId =
        candidate.coverId != null ? candidate.coverId : candidate.id;
      if (!coverId) {
        setCoverSearchError("Invalid OpenLibrary cover candidate.");
        return;
      }
      body.coverId = coverId;
    } else if (provider === "googlebooks") {
      const coverUrl =
        typeof candidate.coverUrl === "string" && candidate.coverUrl
          ? candidate.coverUrl
          : typeof candidate.largeUrl === "string" && candidate.largeUrl
            ? candidate.largeUrl
            : typeof candidate.thumbUrl === "string"
              ? candidate.thumbUrl
              : null;
      if (!coverUrl) {
        setCoverSearchError("Invalid Google Books cover candidate.");
        return;
      }
      body.coverUrl = coverUrl;
    } else {
      setCoverSearchError("Unsupported cover provider.");
      return;
    }

    const loadingId =
      typeof candidate.id === "string"
        ? candidate.id
        : provider === "openlibrary"
          ? `cover-${ String(body.coverId) }`
          : `cover-${ String(body.coverUrl || "") }`;
    setCoverApplyLoadingId(loadingId);
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${ (selectedBook.id || selectedBook._id) }/cover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to update cover";
        throw new Error(message);
      }

      const data = json.data || {};
      const updatedBook = data.book || null;
      if (updatedBook && (updatedBook.id || updatedBook._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updatedBook.id || updatedBook._id) ? updatedBook : b))
        );
        setSelectedBook(updatedBook);
      }
    } catch (err) {
      setCoverSearchError(err.message || "Failed to update cover");
    } finally {
      setCoverApplyLoadingId(null);
    }
  }

  function handleCoverFileChange(event) {
    const file = event.target.files && event.target.files[0];
    setCoverUploadFile(file || null);
    if (file) {
      setCoverSearchError(null);
    }
  }

  async function handleUploadCoverForSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id)) return;
    if (!token) {
      setCoverSearchError("Sign in to upload covers.");
      return;
    }
    if (!coverUploadFile) {
      setCoverSearchError("Choose an image file to upload.");
      return;
    }

    setCoverUploadLoading(true);
    setCoverSearchError(null);

    try {
      const formData = new FormData();
      formData.append("file", coverUploadFile);

      const res = await authFetch(`/books/${ (selectedBook.id || selectedBook._id) }/cover/upload`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Cover upload failed";
        throw new Error(message);
      }

      const data = json.data || {};
      const updatedBook = data.book || null;
      if (updatedBook && (updatedBook.id || updatedBook._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updatedBook.id || updatedBook._id) ? updatedBook : b))
        );
        setSelectedBook(updatedBook);
        setCoverUploadFile(null);
      }
    } catch (err) {
      setCoverSearchError(err.message || "Cover upload failed");
    } finally {
      setCoverUploadLoading(false);
    }
  }

  async function handleDeleteCoverForSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id)) return;
    if (!token) {
      setCoverSearchError("Sign in to delete covers.");
      return;
    }

    setCoverDeleteLoading(true);
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${ (selectedBook.id || selectedBook._id) }/cover`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Cover delete failed";
        throw new Error(message);
      }

      const data = json.data || {};
      const updatedBook = data.book || null;
      if (updatedBook && (updatedBook.id || updatedBook._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updatedBook.id || updatedBook._id) ? updatedBook : b))
        );
        setSelectedBook(updatedBook);
      }
    } catch (err) {
      setCoverSearchError(err.message || "Cover delete failed");
    } finally {
      setCoverDeleteLoading(false);
    }
  }

  async function handleMergeSelectedBooks() {
    if (!token) {
      setMergeSelectionError("You must be signed in to merge books.");
      return;
    }

    if (selectedBookIds.length !== 2) {
      setMergeSelectionError("Select exactly two books to merge.");
      return;
    }

    const [idA, idB] = selectedBookIds;
    const a = books.find((b) => (b.id || b._id) === idA);
    const b = books.find((b) => (b.id || b._id) === idB);

    if (!a || !b) {
      setMergeSelectionError("Selected books are no longer in the current list.");
      return;
    }

    const aIsGr = a.source === "goodreads-import";
    const bIsGr = b.source === "goodreads-import";

    if (aIsGr === bIsGr) {
      setMergeSelectionError(
        "Manual merge currently supports merging one Goodreads-import book into one library book."
      );
      return;
    }

    const primary = aIsGr ? b : a;
    const secondary = aIsGr ? a : b;

    setMergeLoading(true);
    setMergeSelectionError(null);

    try {
      const res = await authFetch("/books/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primaryId: (primary.id || primary._id),
          secondaryId: (secondary.id || secondary._id),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Merge failed";
        throw new Error(message);
      }

      const updatedPrimary = json?.data?.primary || null;
      const deletedId = json?.data?.deletedId?.toString?.();

      if (updatedPrimary && (updatedPrimary.id || updatedPrimary._id)) {
        const updatedId = (updatedPrimary.id || updatedPrimary._id).toString();
        setBooks((prev) =>
          prev
            .filter((b) => (b.id || b._id) !== deletedId)
            .map((b) => ((b.id || b._id) === updatedId ? updatedPrimary : b))
        );

        if (selectedBook) {
          const selId = (selectedBook.id || selectedBook._id);
          if (selId === deletedId) {
            setSelectedBook(updatedPrimary);
          } else if (selId === updatedId) {
            setSelectedBook(updatedPrimary);
          }
        }
      }

      setSelectedBookIds([]);
    } catch (err) {
      setMergeSelectionError(err.message || "Merge failed.");
    } finally {
      setMergeLoading(false);
    }
  }

  async function handleDeleteSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id)) return;
    if (!token) {
      setDeleteError("Sign in to delete books.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const apolloRes = await apolloClient.mutate({
        mutation: DELETE_BOOK,
        variables: { id: (selectedBook.id || selectedBook._id), deleteFiles: deleteIncludeFiles },
      });

      if (!apolloRes.data?.deleteBook?.success) {
        throw new Error("Delete failed");
      }

      const deletedId = apolloRes.data.deleteBook.deletedId || (selectedBook.id || selectedBook._id).toString();

      setBooks((prev) => prev.filter((b) => (b.id || b._id) !== deletedId));
      setSelectedBookIds((prev) => prev.filter((id) => id !== deletedId));
      setSelectedBook(null);
      setDeleteConfirmOpen(false);
    } catch (err) {
      setDeleteError(err.message || "Delete failed.");
    } finally {
      setDeleteLoading(false);
    }
  }

  function beginEditForSelectedBook() {
    if (!selectedBook) return;
    setEditError(null);
    setEditDraft({
      title: selectedBook.title || "",
      authors: Array.isArray(selectedBook.authors)
        ? selectedBook.authors.join(", ")
        : "",
      language: selectedBook.language || "",
      publisher: selectedBook.publisher || "",
      publishedDate: selectedBook.publishedDate
        ? new Date(selectedBook.publishedDate).toISOString().slice(0, 10)
        : "",
      isbn: selectedBook.isbn || "",
      isbn13: selectedBook.isbn13 || "",
      goodreadsId: selectedBook.goodreadsId || "",
      tags: Array.isArray(selectedBook.tags)
        ? selectedBook.tags.join(", ")
        : "",
      review: selectedBook.review || "",
      rating:
        typeof selectedBook.rating === "number" &&
          !Number.isNaN(selectedBook.rating)
          ? String(selectedBook.rating)
          : "",
    });
    setEditMode(true);
  }

  function cancelEditForSelectedBook() {
    setEditMode(false);
    setEditSaving(false);
    setEditError(null);
    setEditDraft(null);
  }

  function closeBookModal() {
    setSelectedBook(null);
    setDownloadOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setDeleteIncludeFiles(false);
    setEnrichError(null);
    setEnrichSummary(null);
    setEnrichLoading(false);
    setCoverSearchQuery("");
    setCoverSearchError(null);
    setCoverSearchResults(null);
    setCoverSearchLoading(false);
    setCoverApplyLoadingId(null);
    setCoverUploadFile(null);
    setCoverUploadLoading(false);
    setCoverDeleteLoading(false);
    setShowCoverTools(false);
    cancelEditForSelectedBook();
  }

  async function handleSaveEditForSelectedBook() {
    if (!(selectedBook?.id || selectedBook?._id) || !editDraft) return;
    if (!token) {
      setEditError("Sign in to edit books.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const payload = {
      title: editDraft.title || null,
      language: editDraft.language || null,
      publisher: editDraft.publisher || null,
      publishedDate: editDraft.publishedDate || null,
      isbn: editDraft.isbn || null,
      isbn13: editDraft.isbn13 || null,
      goodreadsId: editDraft.goodreadsId || null,
      review: editDraft.review || null,
      authors: editDraft.authors
        ? editDraft.authors
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [],
      tags: editDraft.tags
        ? editDraft.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [],
    };

    if (editDraft.rating !== undefined) {
      const ratingNumber =
        editDraft.rating === "" ? null : Number(editDraft.rating);
      if (ratingNumber !== null && Number.isFinite(ratingNumber)) {
        payload.rating = ratingNumber;
      }
    }

    try {
      const apolloRes = await apolloClient.mutate({
        mutation: UPDATE_BOOK,
        variables: { id: (selectedBook.id || selectedBook._id), input: payload },
      });

      const updated = apolloRes.data?.updateBook;
      if (!updated) {
        throw new Error("Edit failed");
      }
      if (updated && (updated.id || updated._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updated.id || updated._id) ? updated : b))
        );
        setSelectedBook(updated);
      }

      setEditMode(false);
      setEditDraft(null);
    } catch (err) {
      setEditError(err.message || "Edit failed.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSendToKindle(book) {
    if (!book || !(book.id || book._id)) return;
    if (!token) {
      setSendToKindleError("Sign in and configure Kindle email first.");
      return;
    }

    setSendToKindleLoading(true);
    setSendToKindleError(null);
    setSendToKindleStatus(null);

    try {
      const res = await authFetch(
        `/books/${ (book.id || book._id) }/send-to-kindle`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Send to Kindle failed";
        throw new Error(message);
      }

      setSendToKindleStatus(json.data || null);
    } catch (err) {
      setSendToKindleError(err.message || "Send to Kindle failed");
    } finally {
      setSendToKindleLoading(false);
    }
  }

  // Keep the progress field in step with whichever book is open.
  useEffect(() => {
    const p = selectedBook?.readingProgress;
    setProgressDraft(Number.isFinite(p) ? Math.round(p) : "");
    setProgressError(null);
    return () => {
      if (progressCommitRef.current) {
        clearTimeout(progressCommitRef.current);
        progressCommitRef.current = null;
      }
    };
  }, [selectedBook]);

  // Save shortly after the last change so dragging the slider or typing a
  // number both land without depending on a release/blur event.
  function scheduleProgressCommit(book, value) {
    if (progressCommitRef.current) clearTimeout(progressCommitRef.current);
    progressCommitRef.current = setTimeout(() => {
      progressCommitRef.current = null;
      handleUpdateProgress(book, value);
    }, 400);
  }

  function clampProgress(value) {
    if (value === "" || value == null) return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  }

  async function handleUpdateProgress(book, value) {
    if (!(book?.id || book?._id)) return;
    const next = clampProgress(value);
    if (next === null) return;
    const current = Number.isFinite(book.readingProgress) ? Math.round(book.readingProgress) : null;
    if (next === current) return;

    if (progressCommitRef.current) {
      clearTimeout(progressCommitRef.current);
      progressCommitRef.current = null;
    }
    const bookId = (book.id || book._id);
    setProgressSavingId(bookId);
    setProgressError(null);
    try {
      const apolloRes = await apolloClient.mutate({
        mutation: UPDATE_BOOK,
        variables: { id: bookId, input: { readingProgress: next } },
      });
      const updated = apolloRes.data?.updateBook;
      if (!updated) throw new Error("Failed to update progress");
      setBooks((prev) =>
        prev.map((b) => ((b.id || b._id) === (updated.id || updated._id) ? updated : b))
      );
      if (selectedBook && (selectedBook.id || selectedBook._id) === (updated.id || updated._id)) {
        setSelectedBook(updated);
      }
    } catch (err) {
      console.error("Failed to update progress", err);
      setProgressError(err?.message || "Failed to save progress");
      setProgressDraft(current ?? "");
    } finally {
      setProgressSavingId(null);
    }
  }

  async function handleUpdateShelf(book, newShelf) {
    if (!(book?.id || book?._id)) return;
    // "" clears the shelf (the detail sheet's "No shelf" row); only a true
    // no-op — same value as today — is skipped.
    if (newShelf === undefined || newShelf === null) return;
    if ((newShelf || "") === (book.shelf || "")) return;

    const bookId = (book.id || book._id);
    setShelfSavingId(bookId);

    try {
      const apolloRes = await apolloClient.mutate({
        mutation: UPDATE_BOOK,
        variables: { id: bookId, input: { shelf: newShelf } },
      });
      const updated = apolloRes.data?.updateBook;
      if (!updated) {
        throw new Error("Failed to update shelf");
      }
      if (updated && (updated.id || updated._id)) {
        setBooks((prev) =>
          prev.map((b) => ((b.id || b._id) === (updated.id || updated._id) ? updated : b))
        );
        if (selectedBook && (selectedBook.id || selectedBook._id) === (updated.id || updated._id)) {
          setSelectedBook(updated);
        }
      }

      try {
        const shelvesRes = await apolloClient.query({
          query: GET_SHELVES,
          fetchPolicy: "no-cache",
        });
        if (shelvesRes.data?.shelves) {
          setShelfSummary(shelvesRes.data.shelves);
        }
      } catch {
        // ignore shelf summary refresh errors
      }

      // Reload first page with current filters so shelf-based views update
      await loadBooksPage(1, { append: false });
    } catch (err) {
      console.error("Failed to update shelf", err);
    } finally {
      setShelfSavingId(null);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loadingMore && hasMore) {
        loadBooksPage(page + 1, { append: true });
      }
    });

    const target = loadMoreRef.current;
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
      observer.disconnect();
    };
  }, [
    hasMore,
    loading,
    loadingMore,
    page,
    sortBy,
    authorFilter,
    tagFilter,
    shelfFilter,
  ]);

  const apiOnline = health?.status === "ok" && health?.db?.state === 1;

  function handleLogout() {
    resetUserStore();
    logoutRequest();
    stopRefreshTimer();

    setToken(null);
    setUser(null);
    setAiStatus(null);
    setAiStatusError(null);
    bootstrapRanRef.current = false;
    defaultShelfAppliedRef.current = false;
  }

  function toggleBasket(bookId, event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    setBasketBookIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
    setBasketError(null);
  }

  function clearBasket() {
    setBasketBookIds([]);
    setBasketError(null);
    setBasketResult(null);
    setBasketResultOpen(false);
  }

  async function handleCreateDeviceBasket() {
    if (!token) {
      setBasketError("Sign in to create a device basket.");
      return;
    }
    if (basketBookIds.length === 0) {
      setBasketError("Select at least one book.");
      return;
    }
    if (basketBookIds.length > 50) {
      setBasketError("Maximum 50 books per basket.");
      return;
    }

    setBasketLoading(true);
    setBasketError(null);
    setBasketResult(null);

    try {
      const res = await authFetch("/device-baskets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: "kindle", bookIds: basketBookIds }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        const message = json?.message || json?.error || `Failed to create basket (${res.status})`;
        throw new Error(message);
      }

      setBasketResult(json); // { slug, url, expiresAt }
      setBasketResultOpen(true);
    } catch (err) {
      setBasketError(err.message || "Failed to create device basket.");
    } finally {
      setBasketLoading(false);
    }
  }

  async function handleCheckAiStatus() {
    if (!token) {
      setAiStatusError("You must be signed in to check AI status.");
      return;
    }

    setAiStatusLoading(true);
    setAiStatusError(null);

    try {
      const response = await authFetch("/ai/status");

      const json = await response.json().catch(() => null);

      if (!response.ok || json?.success === false) {
        const message =
          json?.error?.message ||
          json?.message ||
          `AI status failed (${ response.status })`;
        throw new Error(message);
      }

      setAiStatus(json?.data || null);
    } catch (err) {
      setAiStatusError(err.message || "Failed to load AI status");
    } finally {
      setAiStatusLoading(false);
    }
  }

  if (sessionLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          "@supports (height: 100dvh)": { minHeight: "100dvh" },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
          color: "text.secondary",
          typography: "body1",
        }}
      >
        Checking session…
      </Box>
    );
  }

  if (!user) {
    return (
      <LoginSplash
        appName="book"
        appSuffix="geek"
        taglineLine1="Read beautifully."
        taglineLine2="Your library, reimagined."
        description="A modern, clean e-reader for your personal library. upload, organize, and read your favorite books anywhere."
        features={['EPUB Support', 'Sync Progress', 'Metadata Management', 'Dark Mode']}
        onLogin={() => {
          setAuthLoading(true);
          setAuthError(null);
          loginRedirect("bookgeek", window.location.href, "login");
        }}
        loading={authLoading}
        error={authError}
        // BookGeek branding (Blue/Slate)
        logoColor="text.primary"
        logoSuffixColor="primary.main"
        // Custom ink wash for BookGeek
        inkColors={[
          'rgba(59, 130, 246, 0.08)', // Blue
          'rgba(30, 64, 175, 0.06)'   // Darker Blue
        ]}
      />
    );
  }

  // Suite shell grammar (THE_UI_UNIFICATION_PLAN.md §3): the top bar is the
  // shell's `topBar`, not a sibling AppBar above it, so the sidebar column runs
  // full height; `nav` hands the shell the sidebar *content*, and it owns the
  // md breakpoint, the mobile drawer and the 220px width. The dialogs below
  // stay siblings of the shell (all of them are portals or `fixed` overlays).
  return (
    <>
      <GeekShell
        nav={
          <Sidebar
            user={user}
            shelves={shelves}
            shelfFilter={shelfFilter}
            setShelfFilter={setShelfFilter}
            shelfSummary={shelfSummary}
            activeView={activeView}
            setActiveView={setActiveView}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            authorFilter={authorFilter}
            setAuthorFilter={setAuthorFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            savedFilters={savedFilters}
            savedFiltersError={savedFiltersError}
            applySavedFilter={applySavedFilter}
            handleDeleteSavedFilter={handleDeleteSavedFilter}
            deleteFilterLoadingId={deleteFilterLoadingId}
            onSignOut={handleLogout}
          />
        }
        navSx={{ bgcolor: 'background.paper' }}
        topBar={
          <TopBar
            user={user}
            activeView={activeView}
            setActiveView={setActiveView}
            setAddBookOpen={setAddBookOpen}
            onSignOut={handleLogout}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        }
      >
      <GeekAppFrame>
        <Box 
          sx={{ 
            p: { xs: 2, md: 3 },
            maxWidth: '1200px',
            mx: 'auto'
          }}
        >
          {/* Main content */}

          <LibraryView
            activeView={activeView}
            applySavedFilter={applySavedFilter}
            authorFilter={authorFilter}
            basketBookIds={basketBookIds}
            basketError={basketError}
            basketLoading={basketLoading}
            books={books}
            clearBasket={clearBasket}
            error={error}
            handleCreateDeviceBasket={handleCreateDeviceBasket}
            handleMergeSelectedBooks={handleMergeSelectedBooks}
            handleSaveCurrentFilter={handleSaveCurrentFilter}
            hasMore={hasMore}
            loadMoreRef={loadMoreRef}
            loading={loading}
            loadingMore={loadingMore}
            mergeLoading={mergeLoading}
            mergeSelectionError={mergeSelectionError}
            onRetry={() => loadBooksPage(1, { append: false })}
            saveFilterLoading={saveFilterLoading}
            savedFilters={savedFilters}
            savedFiltersError={savedFiltersError}
            searchQuery={searchQuery}
            selectMode={selectMode}
            selectedBookIds={selectedBookIds}
            setActiveView={setActiveView}
            setAuthorFilter={setAuthorFilter}
            setDownloadOpen={setDownloadOpen}
            setSearchQuery={setSearchQuery}
            setSelectMode={setSelectMode}
            setSelectedBook={setSelectedBook}
            setShelfFilter={setShelfFilter}
            setSortBy={setSortBy}
            setSortDir={setSortDir}
            setTagFilter={setTagFilter}
            shelfFilter={shelfFilter}
            shelfSummary={shelfSummary}
            shelves={shelves}
            showMergeUi={showMergeUi}
            sortBy={sortBy}
            sortDir={sortDir}
            tagFilter={tagFilter}
            toggleBasket={toggleBasket}
            toggleBookSelection={toggleBookSelection}
            total={total}
          />

          {activeView === "profile" && (
            <SettingsView
              aiStatus={aiStatus}
              aiStatusError={aiStatusError}
              aiStatusLoading={aiStatusLoading}
              authError={authError}
              authLoading={authLoading}
              calibreRescanError={calibreRescanError}
              calibreRescanLoading={calibreRescanLoading}
              calibreRescanSummary={calibreRescanSummary}
              customShelves={customShelves}
              defaultShelfPref={defaultShelfPref}
              deviceWordInput={deviceWordInput}
              goodreadsDedupeError={goodreadsDedupeError}
              goodreadsDedupeLoading={goodreadsDedupeLoading}
              goodreadsDedupeSummary={goodreadsDedupeSummary}
              goodreadsFile={goodreadsFile}
              goodreadsImportError={goodreadsImportError}
              goodreadsImportLoading={goodreadsImportLoading}
              goodreadsImportSummary={goodreadsImportSummary}
              handleAddCustomShelf={handleAddCustomShelf}
              handleCalibreRescan={handleCalibreRescan}
              handleCheckAiStatus={handleCheckAiStatus}
              handleDeleteCustomShelf={handleDeleteCustomShelf}
              handleGoodreadsDedupe={handleGoodreadsDedupe}
              handleGoodreadsFileChange={handleGoodreadsFileChange}
              handleGoodreadsImport={handleGoodreadsImport}
              handleLogout={handleLogout}
              handleSaveDefaultShelf={handleSaveDefaultShelf}
              handleSaveProfile={handleSaveProfile}
              kindleEmailInput={kindleEmailInput}
              newShelfLabel={newShelfLabel}
              prefSaveError={prefSaveError}
              prefSaveLoading={prefSaveLoading}
              prefSaveMessage={prefSaveMessage}
              profileError={profileError}
              profileLoading={profileLoading}
              profileMessage={profileMessage}
              setActiveView={setActiveView}
              setAuthError={setAuthError}
              setAuthLoading={setAuthLoading}
              setDefaultShelfPref={setDefaultShelfPref}
              setDeviceWordInput={setDeviceWordInput}
              setKindleEmailInput={setKindleEmailInput}
              setNewShelfLabel={setNewShelfLabel}
              setShelfFilter={setShelfFilter}
              shelfEditError={shelfEditError}
              shelfEditLoading={shelfEditLoading}
              shelves={shelves}
              user={user}
            />
          )}

      {selectedBook && (
        <BookDetailModal
          basketBookIds={basketBookIds}
          beginEditForSelectedBook={beginEditForSelectedBook}
          cancelEditForSelectedBook={cancelEditForSelectedBook}
          closeBookModal={closeBookModal}
          convertingFormat={convertingFormat}
          coverApplyLoadingId={coverApplyLoadingId}
          coverDeleteLoading={coverDeleteLoading}
          coverSearchError={coverSearchError}
          coverSearchLoading={coverSearchLoading}
          coverSearchQuery={coverSearchQuery}
          coverSearchResults={coverSearchResults}
          coverUploadFile={coverUploadFile}
          coverUploadLoading={coverUploadLoading}
          deleteConfirmOpen={deleteConfirmOpen}
          deleteError={deleteError}
          deleteIncludeFiles={deleteIncludeFiles}
          deleteLoading={deleteLoading}
          downloadOpen={downloadOpen}
          editDraft={editDraft}
          editError={editError}
          editMode={editMode}
          editSaving={editSaving}
          enrichError={enrichError}
          enrichLoading={enrichLoading}
          enrichSummary={enrichSummary}
          handleApplyCoverCandidate={handleApplyCoverCandidate}
          handleCoverFileChange={handleCoverFileChange}
          handleDeleteCoverForSelectedBook={handleDeleteCoverForSelectedBook}
          handleDeleteSelectedBook={handleDeleteSelectedBook}
          handleDownload={handleDownload}
          handleEnrichSelectedBook={handleEnrichSelectedBook}
          handleSaveEditForSelectedBook={handleSaveEditForSelectedBook}
          handleSearchCoversForSelectedBook={handleSearchCoversForSelectedBook}
          handleSendToKindle={handleSendToKindle}
          handleUpdateProgress={handleUpdateProgress}
          handleUpdateShelf={handleUpdateShelf}
          handleUploadBookFile={handleUploadBookFile}
          handleUploadCoverForSelectedBook={handleUploadCoverForSelectedBook}
          handleUploadFileChange={handleUploadFileChange}
          progressDraft={progressDraft}
          progressError={progressError}
          progressSavingId={progressSavingId}
          scheduleProgressCommit={scheduleProgressCommit}
          selectedBook={selectedBook}
          sendToKindleError={sendToKindleError}
          sendToKindleLoading={sendToKindleLoading}
          sendToKindleStatus={sendToKindleStatus}
          setCoverSearchQuery={setCoverSearchQuery}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
          setDeleteError={setDeleteError}
          setDeleteIncludeFiles={setDeleteIncludeFiles}
          setDownloadOpen={setDownloadOpen}
          setEditDraft={setEditDraft}
          setProgressDraft={setProgressDraft}
          setReaderError={setReaderError}
          setReaderOpen={setReaderOpen}
          setShowCoverTools={setShowCoverTools}
          shelfSavingId={shelfSavingId}
          shelves={shelves}
          showCoverTools={showCoverTools}
          toggleBasket={toggleBasket}
          uploadError={uploadError}
          uploadFile={uploadFile}
          uploadLoading={uploadLoading}
          uploadMessage={uploadMessage}
        />
      )}

      {readerOpen && selectedBook && (
        <ReaderModal
          readerContainerRef={readerContainerRef}
          readerError={readerError}
          readerRenditionRef={readerRenditionRef}
          readerTheme={readerTheme}
          selectedBook={selectedBook}
          setReaderError={setReaderError}
          setReaderOpen={setReaderOpen}
          setReaderTheme={setReaderTheme}
        />
      )}
      </Box>
    </GeekAppFrame>

      {/* Primary action in the thumb zone. Sibling of `GeekAppFrame`, never
          inside it: the frame animates, and an animating element becomes the
          containing block for `position: fixed` children. */}
      <GeekFab
        label="Add book"
        onClick={() => setAddBookOpen(true)}
        hidden={activeView !== "library" || selectMode || basketBookIds.length > 0}
      />
      </GeekShell>


      <AddBookDialog
        addBookAuthors={addBookAuthors}
        addBookError={addBookError}
        addBookIsbn={addBookIsbn}
        addBookLoading={addBookLoading}
        addBookOpen={addBookOpen}
        addBookShelf={addBookShelf}
        addBookTitle={addBookTitle}
        handleCreateBook={handleCreateBook}
        setAddBookAuthors={setAddBookAuthors}
        setAddBookFile={setAddBookFile}
        setAddBookIsbn={setAddBookIsbn}
        setAddBookOpen={setAddBookOpen}
        setAddBookShelf={setAddBookShelf}
        setAddBookTitle={setAddBookTitle}
        shelves={shelves}
      />

      {/* Device Basket Result Dialog */}
      {basketResultOpen && basketResult && (
        <DeviceBasketDialog
          basketResult={basketResult}
          clearBasket={clearBasket}
          profile={profile}
          setBasketError={setBasketError}
          setBasketResult={setBasketResult}
          setBasketResultOpen={setBasketResultOpen}
        />
      )}

    </>
  );
}
