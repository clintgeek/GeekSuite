import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { getMe, loginRedirect, logout as logoutRequest, onLogout, startRefreshTimer, stopRefreshTimer } from "@geeksuite/auth";
import { useUser, usePreferences, useAppPreferences } from "@geeksuite/user";
import { registerReset, reset as resetUserStore } from "./utils/resetUserStore";

let API_BASE = "http://localhost:1800/api";

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  const origin = window.location.origin.replace(/\/$/, "");
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    API_BASE = `${origin}/api`;
  }
}

let INCLUDE_CREDENTIALS = false;
if (typeof window !== "undefined") {
  const origin = window.location.origin.replace(/\/$/, "");
  INCLUDE_CREDENTIALS = API_BASE.startsWith(`${origin}/api`);
}

const shelves = [
  { id: "all", label: "All books" },
  { id: "reading", label: "Reading" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "want-to-read", label: "Want to read" },
  { id: "abandoned", label: "Abandoned" },
  { id: "need-to-find", label: "Need to find" },
];

function decodeBasicHtmlEntities(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function formatDescriptionForDisplay(raw) {
  if (typeof raw !== "string") return "";
  let text = raw;
  const looksHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(text);
  if (looksHtml) {
    text = text
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
      .replace(/<\s*p\b[^>]*>/gi, "")
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "");
  }
  text = decodeBasicHtmlEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function getCoverUrl(book) {
  if (!book || !book._id) return null;
  const base = `${API_BASE}/books/${book._id}/cover`;
  const ts =
    (typeof book.updatedAt === "string" && book.updatedAt) ||
    (typeof book.updatedAt === "number" && book.updatedAt) ||
    (typeof book.createdAt === "string" && book.createdAt) ||
    (typeof book.createdAt === "number" && book.createdAt) ||
    Date.now();
  return `${base}?v=${encodeURIComponent(ts)}`;
}

export default function App() {
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

  const [sortBy, setSortBy] = useState("title");
  const [sortDir, setSortDir] = useState("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [shelfFilter, setShelfFilter] = useState("all");
  const [ownedFilter, setOwnedFilter] = useState("all"); // all | owned | unowned
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
  const [profileMessage, setProfileMessage] = useState(null);

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

  const [activeView, setActiveView] = useState("library");
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("bookgeek-theme") || "dark";
    }
    return "dark";
  });
  const [prefSaveLoading, setPrefSaveLoading] = useState(false);
  const [prefSaveError, setPrefSaveError] = useState(null);
  const [prefSaveMessage, setPrefSaveMessage] = useState(null);
  const [defaultShelfPref, setDefaultShelfPref] = useState("all");

  const bootstrapRanRef = useRef(false);
  const defaultShelfAppliedRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    localStorage.setItem("bookgeek-theme", theme);
  }, [theme]);

  useEffect(() => {
    registerReset(resetUser);
  }, [resetUser]);

  useEffect(() => {
    if (prefsLoaded && preferences?.theme) {
      const remote = preferences.theme;
      if (remote === "light" || remote === "dark") {
        setTheme(remote);
      }
    }
  }, [prefsLoaded, preferences]);

  useEffect(() => {
    if (!user) {
      bootstrapRanRef.current = false;
      return;
    }
    if (sessionLoading) return;
    if (bootstrapRanRef.current) return;
    bootstrapRanRef.current = true;
    bootstrap().catch(() => {});
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
    if (typeof preset.ownedFilter === "string" && preset.ownedFilter) {
      setOwnedFilter(preset.ownedFilter);
    } else if (preset.ownedOnly) {
      setOwnedFilter("owned");
    } else {
      setOwnedFilter("all");
    }
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
      shelfFilter !== "all" ||
      ownedFilter !== "all";

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
          ownedFilter,
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

      const res = await authFetch("/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to create book";
        throw new Error(message);
      }

      let created = json.data || null;

      if (created && created._id && addBookFile) {
        try {
          const formData = new FormData();
          formData.append("file", addBookFile);

          const uploadRes = await authFetch(`/books/${created._id}/upload`, {
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
          if (updated && updated._id) {
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

      if (created && created._id) {
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
      const res = await authFetch(`/profile/library-filters/${encodeURIComponent(id)}`, {
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

      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", "50");
      params.set("sort", sortBy || "title");
      params.set("sortDir", sortDir || "asc");
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (authorFilter.trim()) params.set("author", authorFilter.trim());
      if (tagFilter.trim()) params.set("tag", tagFilter.trim());
      if (shelfFilter !== "all") params.set("shelf", shelfFilter);
      if (ownedFilter === "owned") params.set("owned", "true");
      if (ownedFilter === "unowned") params.set("owned", "false");

      const [healthRes, booksRes] = await Promise.all([
        fetch(`${API_BASE}/health`, { cache: "no-store" }),
        authFetch(`/books?${params.toString()}`, { cache: "no-store" }),
      ]);

      const healthJson = await healthRes.json().catch(() => null);
      const booksJson = await booksRes.json().catch(() => null);

      if (!healthRes.ok) {
        throw new Error(
          booksJson?.error?.message ||
            `Health check failed (${healthRes.status})`
        );
      }

      if (!booksRes.ok || booksJson?.success === false) {
        throw new Error(
          booksJson?.error?.message ||
            booksJson?.message ||
            `Books request failed (${booksRes.status})`
        );
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
      }
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
    if (!book?._id) return;
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

      const res = await authFetch(`/books/${book._id}/upload`, {
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
      if (updated && updated._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updated._id ? updated : b))
        );
        if (selectedBook && selectedBook._id === updated._id) {
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
    const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;

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
        const res = await authFetch("/shelves");
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.success !== false) {
          setShelfSummary(json.data || null);
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
    ownedFilter,
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
    if (!readerOpen || !selectedBook?._id || !readerContainerRef.current) {
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

        const url = `${API_BASE}/books/${selectedBook._id}/download/epub`;
        const book = ePub(url, { openAs: "epub" });
        readerBookRef.current = book;

        const rendition = book.renderTo(readerContainerRef.current, {
          width: "100%",
          height: "100%",
        });
        readerRenditionRef.current = rendition;

        await rendition.display();
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
  }, [readerOpen, selectedBook?._id]);

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
        body: JSON.stringify({ kindleEmail: kindleEmailInput.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to save profile";
        throw new Error(message);
      }

      setProfile(json.data || null);
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
    if (!selectedBook?._id) return;
    if (!token) {
      setEnrichError("Sign in to enrich metadata.");
      return;
    }

    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichSummary(null);

    try {
      const res = await authFetch(`/books/${selectedBook._id}/enrich`, {
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

      if (updatedBook && updatedBook._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updatedBook._id ? updatedBook : b))
        );
        setSelectedBook(updatedBook);
      }

      if (updatedFields.length > 0) {
        setEnrichSummary(`Updated: ${updatedFields.join(", ")}`);
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
    if (!selectedBook?._id) return;
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
        `/books/${selectedBook._id}/search-covers?${params.toString()}`,
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
    if (!selectedBook?._id || !candidate) return;
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
        ? `cover-${String(body.coverId)}`
        : `cover-${String(body.coverUrl || "")}`;
    setCoverApplyLoadingId(loadingId);
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${selectedBook._id}/cover`, {
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
      if (updatedBook && updatedBook._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updatedBook._id ? updatedBook : b))
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
    if (!selectedBook?._id) return;
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

      const res = await authFetch(`/books/${selectedBook._id}/cover/upload`, {
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
      if (updatedBook && updatedBook._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updatedBook._id ? updatedBook : b))
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
    if (!selectedBook?._id) return;
    if (!token) {
      setCoverSearchError("Sign in to delete covers.");
      return;
    }

    setCoverDeleteLoading(true);
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${selectedBook._id}/cover`, {
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
      if (updatedBook && updatedBook._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updatedBook._id ? updatedBook : b))
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
    const a = books.find((b) => b._id === idA);
    const b = books.find((b) => b._id === idB);

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
          primaryId: primary._id,
          secondaryId: secondary._id,
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

      if (updatedPrimary && updatedPrimary._id) {
        const updatedId = updatedPrimary._id.toString();
        setBooks((prev) =>
          prev
            .filter((b) => b._id !== deletedId)
            .map((b) => (b._id === updatedId ? updatedPrimary : b))
        );

        if (selectedBook) {
          const selId = selectedBook._id;
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
    if (!selectedBook?._id) return;
    if (!token) {
      setDeleteError("Sign in to delete books.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    const deleteFlag = deleteIncludeFiles ? "true" : "false";

    try {
      const res = await authFetch(
        `/books/${selectedBook._id}?deleteFiles=${deleteFlag}`,
        {
          method: "DELETE",
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Delete failed";
        throw new Error(message);
      }

      const deletedId =
        json?.data?.deletedId?.toString?.() || selectedBook._id.toString();

      setBooks((prev) => prev.filter((b) => b._id !== deletedId));
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

  async function handleSaveEditForSelectedBook() {
    if (!selectedBook?._id || !editDraft) return;
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
      const res = await authFetch(`/books/${selectedBook._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Edit failed";
        throw new Error(message);
      }

      const updated = json.data || null;
      if (updated && updated._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updated._id ? updated : b))
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
    if (!book?._id) return;
    if (!token) {
      setSendToKindleError("Sign in and configure Kindle email first.");
      return;
    }

    setSendToKindleLoading(true);
    setSendToKindleError(null);
    setSendToKindleStatus(null);

    try {
      const res = await authFetch(
        `/books/${book._id}/send-to-kindle`,
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

  async function handleUpdateShelf(book, newShelf) {
    if (!book?._id) return;
    if (!newShelf || newShelf === book.shelf) return;

    const bookId = book._id;
    setShelfSavingId(bookId);

    try {
      const res = await authFetch(`/books/${bookId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shelf: newShelf }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message || json?.message || "Failed to update shelf";
        throw new Error(message);
      }

      const updated = json.data || null;
      if (updated && updated._id) {
        setBooks((prev) =>
          prev.map((b) => (b._id === updated._id ? updated : b))
        );

        if (selectedBook && selectedBook._id === updated._id) {
          setSelectedBook(updated);
        }
      }

      try {
        const shelvesRes = await authFetch("/shelves");
        const shelvesJson = await shelvesRes.json().catch(() => null);
        if (shelvesRes.ok && shelvesJson?.success !== false) {
          setShelfSummary(shelvesJson.data || null);
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
    if (!hasMore || loadingMore) return;

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
    ownedFilter,
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
          `AI status failed (${response.status})`;
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
      <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-8 md:px-6">
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Checking session…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-panel)' }}>
            <div className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight font-serif" style={{ color: 'var(--color-text-primary)' }}>
                BookGeek
              </h1>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Sign in with your baseGeek account.
              </div>
            </div>

            <div className="space-y-2">
              {authError && (
                <div className="text-xs text-rose-400">{authError}</div>
              )}
              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  setAuthLoading(true);
                  setAuthError(null);
                  loginRedirect("bookgeek", window.location.href, "login");
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
                style={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                {authLoading ? "Redirecting…" : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 md:px-6 md:py-6">
        {/* Top bar */}
        <header className="mb-4 flex items-center justify-between gap-3 md:mb-6">
          <div
            className="cursor-pointer"
            onClick={() => setActiveView("library")}
          >
            <h1 className="text-lg font-bold tracking-tight md:text-xl font-serif" style={{ color: 'var(--color-text-primary)' }}>
              BookGeek
            </h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] md:text-xs">
            <span className="max-w-[180px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {user.email || user.username || "Signed in"}
            </span>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              type="button"
              onClick={() => setActiveView("profile")}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setAddBookOpen(true);
                setAddBookError(null);
              }}
              className="inline-flex items-center rounded-lg border border-emerald-600 bg-emerald-900/40 px-3 py-1.5 text-[11px] font-medium text-emerald-100 hover:border-emerald-400 hover:bg-emerald-800"
            >
              + Add book
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-3 rounded-2xl p-2 md:flex-row md:p-3" style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-panel)' }}>
          {/* Sidebar */}
          <aside className="hidden w-56 flex-none p-3 pr-4 text-xs md:block" style={{ color: 'var(--color-sidebar-text)' }}>
            <nav className="space-y-0.5 text-sm">
              {shelves.map((shelf, idx) => (
                <button
                  key={shelf.id}
                  type="button"
                  className={
                    "group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs md:text-sm transition-colors "
                  }
                  style={
                    shelf.id === shelfFilter
                      ? { backgroundColor: 'var(--color-sidebar-active-bg)', color: 'var(--color-sidebar-active-text)' }
                      : { color: 'var(--color-sidebar-text)' }
                  }
                  onClick={() => {
                    setShelfFilter(shelf.id);
                    setActiveView("library");
                  }}
                >
                  <span>{shelf.label}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ color: 'var(--color-text-faint)', border: '1px solid var(--color-border-subtle)' }}>
                    {(() => {
                      if (!shelfSummary) return "--";
                      if (shelf.id === "all") {
                        return typeof shelfSummary.total === "number"
                          ? shelfSummary.total
                          : "--";
                      }
                      const key = shelf.id;
                      const count = shelfSummary.shelves?.[key];
                      return typeof count === "number" ? count : 0;
                    })()}
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-5 pt-4 text-[11px]" style={{ borderTop: '1px solid var(--color-border-subtle)', color: 'var(--color-text-faint)' }}>
              <div className="mb-1 font-medium" style={{ color: 'var(--color-sidebar-text)' }}>
                Filters
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-400">
                  Ownership
                </label>
                <select
                  value={ownedFilter}
                  onChange={(e) => setOwnedFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-500"
                >
                  <option value="all">All books</option>
                  <option value="owned">Owned only</option>
                  <option value="unowned">Unowned only</option>
                </select>
                {(searchQuery.trim() ||
                  authorFilter.trim() ||
                  tagFilter.trim() ||
                  shelfFilter !== "all" ||
                  ownedFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setAuthorFilter("");
                      setTagFilter("");
                      setShelfFilter("all");
                      setOwnedFilter("all");
                    }}
                    className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500 hover:bg-slate-900"
                  >
                    Clear all filters
                  </button>
                )}
                {savedFiltersError && (
                  <div className="text-[10px] text-rose-400">
                    {savedFiltersError}
                  </div>
                )}
                {saveFilterError && (
                  <div className="text-[10px] text-rose-400">
                    {saveFilterError}
                  </div>
                )}
                {savedFiltersLoading && (
                  <div className="text-[10px] text-slate-400">
                    Loading saved filters…
                  </div>
                )}
                {savedFilters.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-faint)' }}>
                      Saved filters
                    </div>
                    <div className="space-y-1">
                      {savedFilters.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center gap-1"
                        >
                          <button
                            type="button"
                            onClick={() => applySavedFilter(preset)}
                            className="flex-1 truncate rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                          >
                            {preset.name || "(unnamed)"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedFilter(preset.id)}
                            disabled={deleteFilterLoadingId === preset.id}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-[11px] text-slate-300 hover:border-rose-500 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-60"
                            title="Delete saved filter"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

      {addBookOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-2 py-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-100 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Add book
                </h2>
                <p className="text-[11px] text-slate-500">
                  Create a book entry (useful for want-to-read titles). You can
                  attach an EPUB later.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (addBookLoading) return;
                  setAddBookOpen(false);
                  setAddBookError(null);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
              >
                ×
              </button>
            </div>
            <form
              className="space-y-2 text-[11px]"
              onSubmit={handleCreateBook}
            >
              <div className="space-y-1">
                <label className="block text-slate-300">Title *</label>
                <input
                  type="text"
                  value={addBookTitle}
                  onChange={(e) => setAddBookTitle(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Book title"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-slate-300">Authors</label>
                <input
                  type="text"
                  value={addBookAuthors}
                  onChange={(e) => setAddBookAuthors(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Comma-separated list"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-slate-300">ISBN</label>
                <input
                  type="text"
                  value={addBookIsbn}
                  onChange={(e) => setAddBookIsbn(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-slate-300">Optional file</label>
                <input
                  type="file"
                  accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    setAddBookFile(file || null);
                  }}
                  className="text-[10px] text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-100 hover:file:bg-slate-700"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-slate-300">Shelf</label>
                <select
                  value={addBookShelf}
                  onChange={(e) => setAddBookShelf(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                >
                  <option value="want-to-read">Want to read</option>
                  <option value="unread">Unread</option>
                  <option value="reading">Reading</option>
                  <option value="read">Read</option>
                  <option value="abandoned">Abandoned</option>
                  <option value="need-to-find">Need to find</option>
                </select>
              </div>
              {addBookError && (
                <div className="text-[11px] text-rose-400">{addBookError}</div>
              )}
              {token ? (
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (addBookLoading) return;
                      setAddBookOpen(false);
                      setAddBookError(null);
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                    disabled={addBookLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addBookLoading}
                    className="rounded border border-emerald-600 bg-emerald-900/60 px-3 py-1 text-[11px] font-medium text-emerald-100 hover:border-emerald-400 hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {addBookLoading ? "Creating…" : "Create book"}
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-rose-400">
                  You must be signed in to add books.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

            <div className="mt-5 pt-4 text-[11px]" style={{ borderTop: '1px solid var(--color-border-subtle)', color: 'var(--color-text-faint)' }}>
              <div className="mb-1 font-medium" style={{ color: 'var(--color-sidebar-text)' }}>
                Recommendations
              </div>
              {(() => {
                const candidates = books.filter((b) =>
                  b.shelf ? b.shelf === "unread" : true
                );
                if (candidates.length === 0) {
                  return <p>No unread books found yet.</p>;
                }
                const rec =
                  candidates[Math.floor(Math.random() * candidates.length)];
                return (
                  <div className="space-y-2">
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors hover:opacity-90"
                      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
                      onClick={() => {
                        setSelectedBook(rec);
                        setDownloadOpen(false);
                      }}
                    >
                      <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded" style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-bg-surface)' }}>
                        {rec._id && (
                          <img
                            src={`${API_BASE}/books/${rec._id}/cover`}
                            alt={rec.title || "Book cover"}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-serif font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {rec.title || "Untitled"}
                        </div>
                        {Array.isArray(rec.authors) && rec.authors.length > 0 && (
                          <div className="truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            {rec.authors.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                    >
                      Find books
                    </button>
                  </div>
                );
              })()}
            </div>


          </aside>

          {/* Main content */}
          <main
            className={
              "flex-1 rounded-xl p-3.5 md:p-4 " +
              (activeView === "profile" ? "hidden" : "")
            }
            style={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border)' }}
          >
            <div className="mb-2 flex flex-col gap-2 md:mb-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-serif text-base font-bold tracking-tight md:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                  Library
                </h2>
                <p className="text-[11px] md:text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {loading
                    ? "Loading from backend…"
                    : error
                    ? "Backend error — see status chip above."
                    : books.length === 0
                    ? "No books found."
                    : ""}
                </p>
              </div>
            </div>

            {/* Toolbar — two visual zones */}
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              {/* Left cluster: library controls */}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
                  <span style={{ color: 'var(--color-text-faint)' }}>Sort</span>
                  <select
                    className="bg-transparent text-xs outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="title">Title</option>
                    <option value="author">Author</option>
                    <option value="rating">Rating</option>
                    <option value="dateAdded">Date added</option>
                    <option value="dateFinished">Date finished</option>
                    <option value="pageCount">Page count</option>
                    <option value="publishedDate">Published date</option>
                    <option value="owned">Owned</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
                    }
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-text-secondary)' }}
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                  >
                    {sortDir === "asc" ? "↑" : "↓"}
                  </button>
                </div>
                <input
                  type="text"
                  className="flex-1 min-w-[140px] rounded-lg px-2 py-1.5 text-xs outline-none"
                  style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                  placeholder="Search title / author / tag"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Right cluster: filtering */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCurrentFilter}
                  disabled={saveFilterLoading}
                  className="inline-flex items-center rounded-lg border border-sky-600 bg-sky-900/40 px-3 py-1.5 text-xs font-medium text-sky-100 hover:border-sky-400 hover:bg-sky-800 disabled:opacity-60"
                >
                  {saveFilterLoading ? "Saving…" : "Save filter"}
                </button>
                <input
                  type="text"
                  className="min-w-[120px] rounded-lg px-2 py-1.5 text-xs outline-none"
                  style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                  placeholder="Filter by tag / genre"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                />
                <div className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>Ownership</span>
                  <select
                    value={ownedFilter}
                    onChange={(e) => setOwnedFilter(e.target.value)}
                    className="bg-transparent text-xs outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    <option value="all">All</option>
                    <option value="owned">Owned</option>
                    <option value="unowned">Unowned</option>
                  </select>
                </div>
                {showMergeUi && (
                  <button
                    type="button"
                    onClick={handleMergeSelectedBooks}
                    disabled={
                      mergeLoading || selectedBookIds.length !== 2
                    }
                    className={
                      "inline-flex items-center rounded-lg border px-3 py-1.5 text-xs " +
                      (selectedBookIds.length === 2 && !mergeLoading
                        ? "border-sky-500 bg-sky-900/40 text-sky-100 hover:border-sky-400 hover:bg-sky-800"
                        : "border-slate-800 bg-slate-900 text-slate-100 opacity-60")
                    }
                  >
                    {mergeLoading
                      ? "Merging…"
                      : `Merge selected (${selectedBookIds.length || 0}/2)`}
                  </button>
                )}
              </div>
            </div>

            {(searchQuery.trim() ||
              authorFilter.trim() ||
              tagFilter.trim() ||
              shelfFilter !== "all" ||
              ownedFilter !== "all") && (
              <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
                {shelfFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setShelfFilter("all")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>
                      Shelf:{" "}
                      {shelves.find((s) => s.id === shelfFilter)?.label ||
                        shelfFilter}
                    </span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>Search: {searchQuery.trim()}</span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                {authorFilter.trim() && (
                  <button
                    type="button"
                    onClick={() => setAuthorFilter("")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>Author: {authorFilter.trim()}</span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                {tagFilter.trim() && (
                  <button
                    type="button"
                    onClick={() => setTagFilter("")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>Tag: {tagFilter.trim()}</span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                {ownedFilter === "owned" && (
                  <button
                    type="button"
                    onClick={() => setOwnedFilter("all")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>Owned only</span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                {ownedFilter === "unowned" && (
                  <button
                    type="button"
                    onClick={() => setOwnedFilter("all")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span>Unowned only</span>
                    <span className="text-slate-400">×</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setAuthorFilter("");
                    setTagFilter("");
                    setShelfFilter("all");
                    setOwnedFilter("all");
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-200 hover:border-slate-500 hover:bg-slate-900"
                >
                  <span>Clear all</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col rounded-xl p-2.5 text-xs animate-pulse"
                      style={{ backgroundColor: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}
                    >
                      <div className="mb-2 aspect-[2/3] w-full rounded-md" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
                      <div className="mb-1 h-3 w-5/6 rounded" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
                      <div className="h-2.5 w-2/3 rounded" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
                    </div>
                  ))
                : books.map((book) => {
                    const isSelected = selectedBookIds.includes(book._id);
                    return (
                      <div
                        key={book._id}
                        className={
                          "relative flex cursor-pointer flex-col rounded-xl p-2.5 text-xs transition-all duration-200 " +
                          (showMergeUi && isSelected
                            ? "ring-2 ring-sky-500"
                            : "hover:translate-y-[-1px]")
                        }
                        style={{
                          backgroundColor: 'var(--color-bg-card)',
                          boxShadow: 'var(--shadow-card)',
                          color: 'var(--color-text-secondary)',
                        }}
                        onClick={() => {
                          setSelectedBook(book);
                          setDownloadOpen(false);
                        }}
                      >
                        {showMergeUi && (
                          <div className="absolute left-1.5 top-1.5 z-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              onChange={(e) => toggleBookSelection(book._id, e)}
                              className="h-3 w-3 rounded border-slate-500 bg-slate-900 text-sky-500 focus:ring-sky-500"
                              title="Select for manual merge"
                            />
                          </div>
                        )}
                        <div className="mb-2 aspect-[2/3] w-full overflow-hidden rounded-lg" style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                          {book._id ? (
                            <img
                              src={
                                getCoverUrl(book) ||
                                `${API_BASE}/books/${book._id}/cover`
                              }
                              alt={book.title || "Book cover"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.visibility = "hidden";
                              }}
                            />
                          ) : null}
                        </div>
                        <div className="mb-0.5 line-clamp-2 font-serif font-medium text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                          {book.title || "Untitled"}
                        </div>
                        <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          <span className="truncate">
                            {Array.isArray(book.authors) && book.authors.length > 0
                              ? book.authors.join(", ")
                              : "Unknown author"}
                          </span>
                          {book.owned && (
                            <span className="ml-2 flex-shrink-0 rounded-full border border-emerald-500/70 bg-emerald-900/40 px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
                              Owned
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>

            {showMergeUi && mergeSelectionError && (
              <div className="mt-2 text-[11px] text-rose-400">
                {mergeSelectionError}
              </div>
            )}

            {hasMore && !loading && (
              <div
                ref={loadMoreRef}
                className="mt-3 h-6 w-full text-center text-[11px] text-slate-500"
              >
                {loadingMore ? "Loading more…" : "Scroll to load more"}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 md:mt-4 md:text-xs">
              <span>
                {loading
                  ? "Fetching data from API…"
                  : error
                  ? "Error talking to API. Check containers and .env."
                  : books.length === 0
                  ? "Connected to API. No books in the database yet."
                  : `Connected to API. Loaded ${books.length} book${
                      books.length === 1 ? "" : "s"
                    }.`}
              </span>
            </div>
          </main>

          {activeView === "profile" && (
            <section className="flex-1 rounded-xl p-3.5 md:p-4" style={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border)' }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-base font-bold tracking-tight md:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                    Profile &amp; settings
                  </h2>
                  <p className="text-[11px] md:text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Manage your account and Kindle email for send-to-device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView("library");
                    setShelfFilter("all");
                  }}
                  className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800"
                >
                  ← Back to library
                </button>
              </div>

              {!user ? (
                <div className="max-w-sm space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Sign in with your baseGeek account to enable BookGeek
                    features tied to your profile.
                  </div>
                  {authError && (
                    <div className="text-[10px] text-rose-400">{authError}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={() => {
                        setAuthLoading(true);
                        setAuthError(null);
                        loginRedirect("bookgeek", window.location.href, "login");
                      }}
                      className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                    >
                      {authLoading ? "Redirecting…" : "Sign in"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("library")}
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-300">
                      Signed in as{" "}
                      <span className="font-medium">
                        {user.email || user.username || "unknown"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 hover:border-slate-500"
                    >
                      Log out
                    </button>
                  </div>

                  <form
                    className="max-w-sm space-y-2"
                    onSubmit={handleSaveProfile}
                  >
                    <div className="text-[11px] font-medium text-slate-200">
                      Kindle email address
                    </div>
                    <p className="text-[11px] text-slate-500">
                      This is where BookGeek will send EPUBs when you choose
                      &quot;Send to eReader&quot;.
                    </p>
                    <input
                      type="email"
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-slate-500"
                      placeholder="yourname@kindle.com"
                      value={kindleEmailInput}
                      onChange={(e) => setKindleEmailInput(e.target.value)}
                    />
                    {profileError && (
                      <div className="text-[10px] text-rose-400">
                        {profileError}
                      </div>
                    )}
                    {profileMessage && (
                      <div className="text-[10px] text-emerald-300">
                        {profileMessage}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={profileLoading}
                      className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                    >
                      {profileLoading ? "Saving…" : "Save profile"}
                    </button>
                  </form>

                  <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500 space-y-4">
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-slate-200">
                        Library default shelf
                      </div>
                      <p className="mb-2 text-[11px] text-slate-500">
                        Choose which shelf loads by default when you open BookGeek.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <select
                          className="w-full max-w-xs rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-slate-500"
                          value={defaultShelfPref}
                          onChange={(e) => setDefaultShelfPref(e.target.value)}
                        >
                          {shelves.map((shelf) => (
                            <option key={shelf.id} value={shelf.id}>
                              {shelf.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSaveDefaultShelf}
                          disabled={prefSaveLoading}
                          className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                        >
                          {prefSaveLoading ? "Saving…" : "Save default shelf"}
                        </button>
                      </div>
                      {prefSaveError && (
                        <div className="mt-1 text-[10px] text-rose-400">{prefSaveError}</div>
                      )}
                      {prefSaveMessage && (
                        <div className="mt-1 text-[10px] text-emerald-300">{prefSaveMessage}</div>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={handleCheckAiStatus}
                        disabled={aiStatusLoading}
                        className="rounded border border-emerald-600/70 bg-emerald-950/40 px-3 py-1.5 text-[11px] text-emerald-200 hover:border-emerald-400 disabled:opacity-60"
                      >
                        {aiStatusLoading ? "Checking AI…" : "Check AI status"}
                      </button>
                      {aiStatus && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          AI:{" "}
                          <span className="font-medium">
                            {aiStatus.enabled ? "enabled" : "disabled"}
                          </span>
                          {" · "}
                          key:{" "}
                          {aiStatus.apiKeyConfigured ? "configured" : "missing"}
                        </div>
                      )}
                      {aiStatusError && (
                        <div className="mt-1 text-[10px] text-rose-400">
                          {aiStatusError}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-medium text-slate-200">
                        Goodreads import
                      </div>
                      <p className="mb-2 text-[11px] text-slate-500">
                        Upload your Goodreads library CSV export to import ratings,
                        shelves, and read dates onto your existing books.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={handleGoodreadsFileChange}
                          className="text-[11px] text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1.5 file:text-[11px] file:text-slate-100 hover:file:bg-slate-700"
                        />
                        <button
                          type="button"
                          onClick={handleGoodreadsImport}
                          disabled={goodreadsImportLoading || !goodreadsFile}
                          className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                        >
                          {goodreadsImportLoading
                            ? "Importing from Goodreads…"
                            : "Upload & import"}
                        </button>
                      </div>
                      {goodreadsImportError && (
                        <div className="mt-1 text-[10px] text-rose-400">
                          {goodreadsImportError}
                        </div>
                      )}
                      {goodreadsImportSummary && (
                        <div className="mt-1 text-[10px] text-emerald-300">
                          Imported Goodreads CSV: {goodreadsImportSummary.updated ?? 0} updated,
                          {" "}
                          {goodreadsImportSummary.created ?? 0} created,
                          {" "}
                          {goodreadsImportSummary.matched ?? 0} matched to existing,
                          {" "}
                          {goodreadsImportSummary.skippedNoMatch ?? 0} with no usable data.
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGoodreadsDedupe}
                          disabled={goodreadsDedupeLoading}
                          className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                        >
                          {goodreadsDedupeLoading
                            ? "Merging duplicates…"
                            : "Merge Goodreads duplicates"}
                        </button>
                        {goodreadsDedupeError && (
                          <span className="text-[10px] text-rose-400">
                            {goodreadsDedupeError}
                          </span>
                        )}
                        {goodreadsDedupeSummary && (
                          <span className="text-[10px] text-emerald-300">
                            Merged {goodreadsDedupeSummary.merged ?? 0} of {" "}
                            {goodreadsDedupeSummary.candidates ?? 0} Goodreads-only books; {" "}
                            updated {goodreadsDedupeSummary.updatedPrimary ?? 0} primaries; {" "}
                            {goodreadsDedupeSummary.skippedNoPrimary ?? 0} skipped with no primary match.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] font-medium text-slate-200">
                      Library rescan
                    </div>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Walks your on-disk BookGeek library and attaches files to existing books,
                      marking them as owned, or creates new records if nothing matches.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCalibreRescan}
                        disabled={calibreRescanLoading}
                        className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                      >
                        {calibreRescanLoading
                          ? "Scanning library…"
                          : "Rescan library"}
                      </button>
                      {calibreRescanError && (
                        <span className="text-[10px] text-rose-400">
                          {calibreRescanError}
                        </span>
                      )}
                      {calibreRescanSummary && (
                        <span className="text-[10px] text-emerald-300">
                          Scanned {calibreRescanSummary.rows ?? 0} entries; attached to{" "}
                          {calibreRescanSummary.attachedExisting ?? 0} existing books; created{" "}
                          {calibreRescanSummary.createdNew ?? 0} new; skipped{" "}
                          {calibreRescanSummary.skippedNoFiles ?? 0} with no files.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {selectedBook && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-2 py-4">
          <div className="mx-auto flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 md:text-base">
                  Book Details
                </h2>
                <p className="text-[11px] text-slate-500">
                  From your BookGeek library
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
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
                }}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
              >
                ×
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:flex-row">
              <div className="mx-auto w-32 flex-shrink-0 md:mx-0 md:w-40">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                  {selectedBook._id ? (
                    <img
                      src={getCoverUrl(selectedBook) || `${API_BASE}/books/${selectedBook._id}/cover`}
                      alt={selectedBook.title || "Book cover"}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowCoverTools((v) => !v)}
                    className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-[11px] text-slate-200 hover:border-sky-500 hover:text-sky-100"
                    title="Edit cover"
                  >
                    ✎
                  </button>
                </div>
                {showCoverTools && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverFileChange}
                        className="flex-1 min-w-[120px] text-[10px] text-slate-200 file:mr-1 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-100 hover:file:bg-slate-700"
                      />
                      <button
                        type="button"
                        onClick={handleUploadCoverForSelectedBook}
                        disabled={coverUploadLoading || !coverUploadFile}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-100 hover:border-slate-500 disabled:opacity-60"
                      >
                        {coverUploadLoading ? "Uploading…" : "Upload cover"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCoverForSelectedBook}
                        disabled={coverDeleteLoading}
                        className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-rose-500 hover:text-rose-100 disabled:opacity-60"
                      >
                        {coverDeleteLoading ? "Removing…" : "Remove"}
                      </button>
                    </div>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="Search covers…"
                      value={coverSearchQuery}
                      onChange={(e) => setCoverSearchQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleSearchCoversForSelectedBook}
                      disabled={coverSearchLoading}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 hover:border-slate-500 disabled:opacity-60"
                    >
                      {coverSearchLoading ? "Searching covers…" : "Search covers"}
                    </button>
                    {coverSearchError && (
                      <div className="text-[10px] text-rose-400">
                        {coverSearchError}
                      </div>
                    )}
                    {Array.isArray(coverSearchResults) &&
                      coverSearchResults.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-400">
                            Choose a cover:
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-2">
                            {coverSearchResults.slice(0, 9).map((candidate) => {
                              const key =
                                typeof candidate.id === "string"
                                  ? candidate.id
                                  : `cover-${String(
                                      candidate.coverId ?? ""
                                    )}`;
                              const isApplying = coverApplyLoadingId === key;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() =>
                                    handleApplyCoverCandidate(candidate)
                                  }
                                  disabled={!!coverApplyLoadingId}
                                  className="relative overflow-hidden rounded border border-slate-700 bg-slate-900"
                                >
                                  <img
                                    src={candidate.thumbUrl}
                                    alt={candidate.title || "Cover option"}
                                    className="h-28 w-full object-cover"
                                  />
                                  {isApplying && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-slate-100">
                                      Applying…
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 text-sm text-slate-100">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500"
                        onClick={() => setDownloadOpen((open) => !open)}
                      >
                        <span>Download</span>
                        <span className="ml-1 text-[10px]">▾</span>
                      </button>

                      {downloadOpen &&
                        selectedBook.files &&
                        selectedBook.files.length > 0 && (
                          <div className="absolute left-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-[11px] text-slate-100 shadow-xl">
                            {selectedBook.files.map((file) => {
                              const sizeBytes = file.size || 0;
                              const sizeMB = sizeBytes / (1024 * 1024);
                              const sizeLabel =
                                sizeMB >= 0.1
                                  ? `${sizeMB.toFixed(1)} MB`
                                  : `${(sizeBytes / 1024).toFixed(0)} KB`;

                              const fmt = (file.format || "").toLowerCase();
                              const formatSlug = fmt ||
                                (file.path
                                  ? file.path.split(".").pop().toLowerCase()
                                  : "");

                              return (
                                <button
                                  key={file.path}
                                  type="button"
                                  className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-800"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!selectedBook._id || !formatSlug) return;
                                    const url = `${API_BASE}/books/${selectedBook._id}/download/${formatSlug}`;
                                    window.location.href = url;
                                    setDownloadOpen(false);
                                  }}
                                >
                                  <span className="mr-2 font-medium">
                                    {file.format || formatSlug.toUpperCase()}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {sizeLabel}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                    </div>
                    <button
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                      type="button"
                      disabled={sendToKindleLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendToKindle(selectedBook);
                      }}
                    >
                      {sendToKindleLoading ? "Sending…" : "Send EPUB to eReader"}
                    </button>
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReaderError(null);
                        setReaderOpen(true);
                      }}
                    >
                      Read in Browser · EPUB
                    </button>
                    {(!selectedBook.owned ||
                      !selectedBook.files ||
                      selectedBook.files.length === 0) && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <input
                          type="file"
                          accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
                          onChange={handleUploadFileChange}
                          className="text-[10px] text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-100 hover:file:bg-slate-700"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUploadBookFile(selectedBook);
                          }}
                          disabled={uploadLoading || !uploadFile}
                          className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                        >
                          {uploadLoading ? "Attaching…" : "Attach file"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    {editMode ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-500"
                          value={editDraft?.title || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              title: e.target.value,
                            }))
                          }
                          placeholder="Title"
                        />
                        <input
                          type="text"
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
                          value={editDraft?.authors || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              authors: e.target.value,
                            }))
                          }
                          placeholder="Authors (comma-separated)"
                        />
                      </div>
                    ) : (
                      <>
                        <h3 className="text-base font-bold font-serif md:text-lg" style={{ color: 'var(--color-text-primary)' }}>
                          {selectedBook.title || "Untitled"}
                        </h3>
                        {Array.isArray(selectedBook.authors) &&
                          selectedBook.authors.length > 0 && (
                            <div className="text-xs text-sky-400">
                              {selectedBook.authors.join(", ")}
                            </div>
                          )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    {editMode ? (
                      <div className="flex flex-wrap gap-2 w-full">
                        <input
                          type="text"
                          className="min-w-[90px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                          placeholder="Language"
                          value={editDraft?.language || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              language: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                          placeholder="ISBN"
                          value={editDraft?.isbn || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              isbn: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                          placeholder="ISBN13"
                          value={editDraft?.isbn13 || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              isbn13: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="text"
                          className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                          placeholder="Goodreads ID"
                          value={editDraft?.goodreadsId || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              goodreadsId: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <>
                        {selectedBook.language && (
                          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                            <span className="mr-1 text-[10px] uppercase text-slate-500">
                              Language
                            </span>
                            <span>{selectedBook.language}</span>
                          </span>
                        )}
                        {selectedBook.isbn && (
                          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                            <span className="mr-1 text-[10px] uppercase text-slate-500">
                              ISBN
                            </span>
                            <span>{selectedBook.isbn}</span>
                          </span>
                        )}
                        {selectedBook.goodreadsId && (
                          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                            <span className="mr-1 text-[10px] uppercase text-slate-500">
                              Goodreads
                            </span>
                            <span>{selectedBook.goodreadsId}</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {editMode ? (
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <input
                      type="text"
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="Tags (comma-separated)"
                      value={editDraft?.tags || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          tags: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : (
                  Array.isArray(selectedBook.tags) &&
                  selectedBook.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {selectedBook.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )
                )}

                <div className="space-y-1 text-[11px] text-slate-400">
                  {editMode ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                        placeholder="Publisher"
                        value={editDraft?.publisher || ""}
                        onChange={(e) =>
                          setEditDraft((prev) => ({
                            ...(prev || {}),
                            publisher: e.target.value,
                          }))
                        }
                      />
                      <input
                        type="date"
                        className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                        value={editDraft?.publishedDate || ""}
                        onChange={(e) =>
                          setEditDraft((prev) => ({
                            ...(prev || {}),
                            publishedDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <>
                      {selectedBook.publisher && (
                        <div>
                          <span className="font-medium text-slate-300">
                            Publisher:
                          </span>{" "}
                          <span>{selectedBook.publisher}</span>
                        </div>
                      )}
                      {selectedBook.publishedDate && (
                        <div>
                          <span className="font-medium text-slate-300">
                            Published:
                          </span>{" "}
                          <span>
                            {new Date(
                              selectedBook.publishedDate
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {editMode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1">
                        <span className="font-medium text-slate-300">
                          Rating:
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="5"
                          step="0.5"
                          className="w-16 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                          value={editDraft?.rating || ""}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...(prev || {}),
                              rating: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  {selectedBook.owned && (
                    <div>
                      <span className="font-medium text-slate-300">
                        Owned:
                      </span>{" "}
                      <span>Yes</span>
                    </div>
                  )}
                  {typeof selectedBook.rating === "number" &&
                    selectedBook.rating > 0 && (
                      <div>
                        <span className="font-medium text-slate-300">
                          Rating:
                        </span>{" "}
                        {(() => {
                          const r = Math.round(selectedBook.rating);
                          const stars = "★".repeat(Math.max(0, Math.min(5, r)));
                          const empty = "☆".repeat(Math.max(0, 5 - r));
                          return (
                            <span>
                              <span className="text-amber-300">
                                {stars}
                              </span>
                              <span className="text-slate-500">{empty}</span>{" "}
                              <span className="text-slate-300">
                                ({selectedBook.rating}/5)
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  {selectedBook.dateFinished && (
                    <div>
                      <span className="font-medium text-slate-300">
                        Finished:
                      </span>{" "}
                      <span>
                        {new Date(selectedBook.dateFinished).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {selectedBook.dateAdded && (
                    <div>
                      <span className="font-medium text-slate-300">
                        Added:
                      </span>{" "}
                      <span>
                        {new Date(selectedBook.dateAdded).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {typeof selectedBook.readCount === "number" &&
                    selectedBook.readCount > 0 && (
                      <div>
                        <span className="font-medium text-slate-300">
                          Read count:
                        </span>{" "}
                        <span>{selectedBook.readCount}</span>
                      </div>
                    )}
                  {editMode ? (
                    <div className="mt-1 space-y-1">
                      <div className="font-medium text-slate-300">Review:</div>
                      <textarea
                        className="h-20 w-full resize-y rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                        placeholder="Your review or notes for this book"
                        value={editDraft?.review || ""}
                        onChange={(e) =>
                          setEditDraft((prev) => ({
                            ...(prev || {}),
                            review: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    selectedBook.review && (
                      <div>
                        <span className="font-medium text-slate-300">
                          Review:
                        </span>{" "}
                        <span className="whitespace-pre-wrap text-slate-200">
                          {selectedBook.review}
                        </span>
                      </div>
                    )
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-300">Shelf:</span>
                    <select
                      className="min-w-[140px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-slate-500"
                      value={selectedBook.shelf || ""}
                      disabled={
                        !!shelfSavingId && shelfSavingId === selectedBook._id
                      }
                      onChange={(e) =>
                        handleUpdateShelf(selectedBook, e.target.value)
                      }
                    >
                      <option value="">Assign shelf…</option>
                      {shelves
                        .filter((s) => s.id !== "all")
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {sendToKindleError && (
                  <div className="text-[11px] text-rose-400">
                    {sendToKindleError}
                  </div>
                )}
                {sendToKindleStatus && (
                  <div className="text-[11px] text-emerald-300">
                    Sending to {sendToKindleStatus.kindleEmail}
                  </div>
                )}
                {uploadError && (
                  <div className="text-[11px] text-rose-400">{uploadError}</div>
                )}
                {uploadMessage && (
                  <div className="text-[11px] text-emerald-300">
                    {uploadMessage}
                  </div>
                )}
                <div className="mt-2 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {editMode ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveEditForSelectedBook}
                              disabled={editSaving}
                              className="rounded border border-sky-600 bg-sky-800 px-3 py-1 text-[11px] font-semibold text-sky-50 hover:border-sky-400 hover:bg-sky-700 disabled:opacity-60"
                            >
                              {editSaving ? "Saving…" : "Save changes"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditForSelectedBook}
                              disabled={editSaving}
                              className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={beginEditForSelectedBook}
                              className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-sky-500 hover:text-sky-200"
                            >
                              Edit metadata…
                            </button>
                            <button
                              type="button"
                              onClick={handleEnrichSelectedBook}
                              disabled={enrichLoading}
                              className="rounded border border-emerald-700 bg-emerald-950/60 px-3 py-1 text-[11px] font-medium text-emerald-200 hover:border-emerald-500 hover:bg-emerald-900/80 disabled:opacity-60"
                            >
                              {enrichLoading ? "Enriching metadata…" : "Enrich metadata"}
                            </button>
                          </>
                        )}
                      </div>
                      {(editError || enrichError || enrichSummary) && (
                        <div className="space-y-0.5">
                          {editError && (
                            <div className="text-rose-400">{editError}</div>
                          )}
                          {enrichError && (
                            <div className="text-rose-400">{enrichError}</div>
                          )}
                          {enrichSummary && (
                            <div className="text-emerald-300">{enrichSummary}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1"></div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {deleteError && (
                        <div className="mb-1 text-rose-400">{deleteError}</div>
                      )}
                      {deleteConfirmOpen ? (
                        <>
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-slate-500 bg-slate-900 text-rose-500 focus:ring-rose-500"
                              checked={deleteIncludeFiles}
                              onChange={(e) =>
                                setDeleteIncludeFiles(e.target.checked)
                              }
                            />
                            <span>Also delete files</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (!deleteLoading) {
                                setDeleteConfirmOpen(false);
                                setDeleteError(null);
                                setDeleteIncludeFiles(false);
                              }
                            }}
                            className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                            disabled={deleteLoading}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeleteSelectedBook}
                            disabled={deleteLoading}
                            className="rounded border border-rose-600 bg-rose-800 px-3 py-1 text-[11px] font-semibold text-rose-50 hover:border-rose-400 hover:bg-rose-700 disabled:opacity-60"
                          >
                            {deleteLoading ? "Deleting…" : "Delete book"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmOpen(true);
                            setDeleteError(null);
                          }}
                          className="rounded border border-rose-700 bg-rose-950/60 px-3 py-1 text-[11px] font-medium text-rose-200 hover:border-rose-500 hover:bg-rose-900/80"
                        >
                          Delete this book…
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {selectedBook.description && (
                  <div className="mt-2 space-y-1 text-[13px] leading-relaxed text-slate-200">
                    <div className="text-sm font-semibold text-slate-100">
                      Description
                    </div>
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">
                      {formatDescriptionForDisplay(selectedBook.description)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {readerOpen && selectedBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-2 py-4">
          <div className="mx-auto flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  In-browser reader
                </div>
                <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                  {selectedBook.title || "Untitled"}
                </div>
                {Array.isArray(selectedBook.authors) && selectedBook.authors.length > 0 && (
                  <div className="text-[11px] text-slate-400 line-clamp-1">
                    {selectedBook.authors.join(", ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setReaderOpen(false);
                  setReaderError(null);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
              >
                ×
              </button>
            </div>
            <div className="flex-1 bg-slate-900">
              <div
                ref={readerContainerRef}
                className="h-full w-full overflow-hidden bg-slate-900"
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (readerRenditionRef.current?.prev) {
                      readerRenditionRef.current.prev();
                    }
                  }}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (readerRenditionRef.current?.next) {
                      readerRenditionRef.current.next();
                    }
                  }}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  Next →
                </button>
              </div>
              <div className="text-[11px] text-rose-400">
                {readerError || null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
