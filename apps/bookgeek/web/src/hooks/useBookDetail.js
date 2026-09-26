/**
 * Everything the `/book/:id` sheet needs: the book (from the cache when the
 * library already holds its row, from the gateway on a deep link), and every
 * action the sheet offers — read, send to Kindle, shelf, progress, download
 * formats, attach a file, enrich, covers, edit + AI draft, delete.
 *
 * Returned under the prop names `BookDetailModal` has always taken, so the
 * view did not change. The route mounts one of these per book id
 * (views/BookDetailRoute.jsx keys it), so per-book state — "Sending to…",
 * a picked-but-unsent file, an open confirm — cannot leak from one book to
 * the next: that whole class of bug (CONTEXT.md, going-over P1 "per-book state
 * leaked between books") is gone by construction rather than by a reset list.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { GET_BOOK } from "../graphql/queries.js";
import { authFetch } from "../utils/authFetch";
import { bookIdOf, useBookActions } from "./useBookActions";
import { useBookEdit } from "./useBookEdit";
import { useCoverTools } from "./useCoverTools";
import { useReader } from "./useReader";

function clampProgress(value) {
  if (value === "" || value == null) return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

export function useBookDetail({ bookId, onClose, onDeleted }) {
  const { data, loading, error } = useQuery(GET_BOOK, {
    variables: { id: bookId },
    // A card tap is answered from the row (Query.book's read policy); a deep
    // link, or a row missing fields, fetches once. After that the sheet only
    // ever reads the cache, so a delete's eviction closes it quietly instead
    // of asking the gateway for a book that no longer exists.
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-only",
  });
  const selectedBook = data?.book ?? null;
  const actions = useBookActions();

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [convertingFormat, setConvertingFormat] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState(null);
  const [enrichSummary, setEnrichSummary] = useState(null);

  const [sendToKindleLoading, setSendToKindleLoading] = useState(false);
  const [sendToKindleStatus, setSendToKindleStatus] = useState(null);
  const [sendToKindleError, setSendToKindleError] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);

  const [shelfSavingId, setShelfSavingId] = useState(null);
  const [shelfError, setShelfError] = useState(null);
  const [progressSavingId, setProgressSavingId] = useState(null);
  const [progressDraft, setProgressDraft] = useState("");
  const [progressError, setProgressError] = useState(null);
  const progressCommitRef = useRef(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteIncludeFiles, setDeleteIncludeFiles] = useState(false);

  const covers = useCoverTools({ selectedBook, writeBook: actions.writeBook });
  const edit = useBookEdit({ selectedBook, updateBook: actions.updateBook });
  const reader = useReader(selectedBook);

  // Reset per-book enrichment status whenever the open book changes (an
  // enrich's own write included — its toast has already fired by then).
  useEffect(() => {
    setEnrichError(null);
    setEnrichSummary(null);
    setEnrichLoading(false);
  }, [selectedBook]);

  // Keep the progress field in step with the open book.
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

  function handleUploadFileChange(event) {
    const file = event.target.files && event.target.files[0];
    setUploadFile(file || null);
    setUploadError(null);
    setUploadMessage(null);
  }

  async function handleUploadBookFile(book) {
    const id = bookIdOf(book);
    if (!id) return;
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

      const res = await authFetch(`/books/${ id }/upload`, { method: "POST", body: formData });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Failed to attach file";
        throw new Error(message);
      }

      actions.writeBook(json.data || null);
      setUploadMessage("File attached to this book.");
      setUploadFile(null);
    } catch (err) {
      setUploadError(err.message || "Failed to attach file");
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleDownload(book, format) {
    const id = bookIdOf(book);
    if (!id) return;

    setConvertingFormat(format);
    setDownloadOpen(false);
    setDownloadError(null);

    try {
      const res = await authFetch(`/books/${ id }/download/${ format }`);

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
      setDownloadError(err.message || "Download failed");
    } finally {
      setConvertingFormat(null);
    }
  }

  async function handleEnrichSelectedBook() {
    const id = bookIdOf(selectedBook);
    if (!id) return;

    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichSummary(null);

    try {
      const res = await authFetch(`/books/${ id }/enrich`, { method: "POST" });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Metadata enrichment failed";
        throw new Error(message);
      }

      const result = json.data || {};
      const updatedFields = Array.isArray(result.updatedFields) ? result.updatedFields : [];

      actions.writeBook(result.book || null);

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

  async function handleSendToKindle(book) {
    const id = bookIdOf(book);
    if (!id) return;

    setSendToKindleLoading(true);
    setSendToKindleError(null);
    setSendToKindleStatus(null);

    try {
      const res = await authFetch(`/books/${ id }/send-to-kindle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Send to Kindle failed";
        throw new Error(message);
      }

      setSendToKindleStatus(json.data || null);
    } catch (err) {
      setSendToKindleError(err.message || "Send to Kindle failed");
    } finally {
      setSendToKindleLoading(false);
    }
  }

  async function handleUpdateProgress(book, value) {
    const id = bookIdOf(book);
    if (!id) return;
    const next = clampProgress(value);
    if (next === null) return;
    const current = Number.isFinite(book.readingProgress) ? Math.round(book.readingProgress) : null;
    if (next === current) return;

    if (progressCommitRef.current) {
      clearTimeout(progressCommitRef.current);
      progressCommitRef.current = null;
    }
    setProgressSavingId(id);
    setProgressError(null);
    try {
      await actions.updateBook(id, { readingProgress: next }, "Failed to update progress");
    } catch (err) {
      console.error("Failed to update progress", err);
      setProgressError(err?.message || "Failed to save progress");
      setProgressDraft(current ?? "");
    } finally {
      setProgressSavingId(null);
    }
  }

  // Save shortly after the last change so dragging the slider or typing a
  // number both land without depending on a release/blur event.
  function scheduleProgressCommit(book, value) {
    if (progressCommitRef.current) clearTimeout(progressCommitRef.current);
    progressCommitRef.current = setTimeout(() => {
      progressCommitRef.current = null;
      handleUpdateProgress(book, value);
    }, 400);
  }

  async function handleUpdateShelf(book, newShelf) {
    const id = bookIdOf(book);
    if (!id) return;
    // "" clears the shelf (the detail sheet's "No shelf" row); only a true
    // no-op — same value as today — is skipped.
    if (newShelf === undefined || newShelf === null) return;
    if ((newShelf || "") === (book.shelf || "")) return;

    setShelfSavingId(id);
    setShelfError(null);
    try {
      await actions.updateShelf(book, newShelf);
    } catch (err) {
      // Was `console.error` and nothing else: with the gateway down the sheet
      // closed, the shelf did not move, and the user was told nothing at all.
      console.error("Failed to update shelf", err);
      setShelfError(err?.message || "Failed to update shelf");
    } finally {
      setShelfSavingId(null);
    }
  }

  async function handleDeleteSelectedBook() {
    const id = bookIdOf(selectedBook);
    if (!id) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      // The sheet closes BEFORE the book leaves the cache, so it never renders
      // a book that is gone.
      await actions.deleteBook(id, {
        deleteFiles: deleteIncludeFiles,
        beforeEvict: (deletedId) => {
          setDeleteConfirmOpen(false);
          onDeleted?.(deletedId);
        },
      });
    } catch (err) {
      setDeleteError(err.message || "Delete failed.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return {
    // The book and how it loaded — the route decides what a miss means.
    selectedBook,
    bookLoading: loading && !selectedBook,
    bookError: error || null,
    closeBookModal: onClose,

    downloadOpen,
    setDownloadOpen,
    convertingFormat,
    downloadError,
    handleDownload,

    enrichLoading,
    enrichError,
    enrichSummary,
    handleEnrichSelectedBook,

    sendToKindleLoading,
    sendToKindleStatus,
    sendToKindleError,
    handleSendToKindle,

    uploadFile,
    uploadLoading,
    uploadError,
    uploadMessage,
    handleUploadFileChange,
    handleUploadBookFile,

    shelfSavingId,
    shelfError,
    handleUpdateShelf,

    progressDraft,
    setProgressDraft,
    progressError,
    progressSavingId,
    scheduleProgressCommit,
    handleUpdateProgress,

    deleteLoading,
    deleteError,
    setDeleteError,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteIncludeFiles,
    setDeleteIncludeFiles,
    handleDeleteSelectedBook,

    ...covers,
    ...edit,
    reader,
    setReaderOpen: reader.setReaderOpen,
    setReaderError: reader.setReaderError,
  };
}
