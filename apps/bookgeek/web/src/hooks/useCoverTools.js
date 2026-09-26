/**
 * The detail sheet's cover tools: search OpenLibrary/Google Books
 * (`GET /api/books/:id/search-covers`), apply a candidate
 * (`POST /api/books/:id/cover`), upload an image (`POST …/cover/upload`) and
 * delete (`DELETE …/cover`). Every reply carries the updated book, which is
 * written over `Book:<id>` in the cache (so the grid's cover changes too).
 *
 * The state resets whenever the open book changes — including when one of
 * these writes changes it, which is what closes the sheet after a cover is
 * applied, as it always has.
 */
import { useEffect, useState } from "react";
import { authFetch } from "../utils/authFetch";
import { coverCandidateKey } from "../views/detail/bookFacts";

export function useCoverTools({ selectedBook, writeBook }) {
  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState(null);
  const [coverSearchResults, setCoverSearchResults] = useState(null);
  const [coverApplyLoadingId, setCoverApplyLoadingId] = useState(null);
  const [coverUploadFile, setCoverUploadFile] = useState(null);
  const [coverUploadLoading, setCoverUploadLoading] = useState(false);
  const [coverDeleteLoading, setCoverDeleteLoading] = useState(false);
  const [showCoverTools, setShowCoverTools] = useState(false);

  const bookId = selectedBook?.id || selectedBook?._id;

  useEffect(() => {
    setCoverSearchQuery(selectedBook && typeof selectedBook.title === "string" ? selectedBook.title : "");
    setCoverSearchError(null);
    setCoverSearchResults(null);
    setCoverSearchLoading(false);
    setCoverApplyLoadingId(null);
    setCoverUploadFile(null);
    setCoverUploadLoading(false);
    setCoverDeleteLoading(false);
    setShowCoverTools(false);
  }, [selectedBook]);

  async function handleSearchCoversForSelectedBook() {
    if (!bookId) return;

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

      const res = await authFetch(`/books/${ bookId }/search-covers?${ params.toString() }`, { method: "GET" });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Cover search failed";
        throw new Error(message);
      }

      const data = json.data || {};
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
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
    if (!bookId || !candidate) return;

    const provider = typeof candidate.source === "string" ? candidate.source : "openlibrary";

    const body = { provider };
    if (provider === "openlibrary") {
      const coverId = candidate.coverId != null ? candidate.coverId : candidate.id;
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

    // One helper, shared with CoverTools' grid keys — see bookFacts.js.
    setCoverApplyLoadingId(coverCandidateKey(candidate));
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${ bookId }/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Failed to update cover";
        throw new Error(message);
      }

      writeBook((json.data || {}).book || null);
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
    if (!bookId) return;
    if (!coverUploadFile) {
      setCoverSearchError("Choose an image file to upload.");
      return;
    }

    setCoverUploadLoading(true);
    setCoverSearchError(null);

    try {
      const formData = new FormData();
      formData.append("file", coverUploadFile);

      const res = await authFetch(`/books/${ bookId }/cover/upload`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Cover upload failed";
        throw new Error(message);
      }

      if (writeBook((json.data || {}).book || null)) {
        setCoverUploadFile(null);
      }
    } catch (err) {
      setCoverSearchError(err.message || "Cover upload failed");
    } finally {
      setCoverUploadLoading(false);
    }
  }

  async function handleDeleteCoverForSelectedBook() {
    if (!bookId) return;

    setCoverDeleteLoading(true);
    setCoverSearchError(null);

    try {
      const res = await authFetch(`/books/${ bookId }/cover`, { method: "DELETE" });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        const message = json?.error?.message || json?.message || "Cover delete failed";
        throw new Error(message);
      }

      writeBook((json.data || {}).book || null);
    } catch (err) {
      setCoverSearchError(err.message || "Cover delete failed");
    } finally {
      setCoverDeleteLoading(false);
    }
  }

  return {
    coverSearchQuery,
    setCoverSearchQuery,
    coverSearchLoading,
    coverSearchError,
    coverSearchResults,
    coverApplyLoadingId,
    coverUploadFile,
    coverUploadLoading,
    coverDeleteLoading,
    showCoverTools,
    setShowCoverTools,
    handleSearchCoversForSelectedBook,
    handleApplyCoverCandidate,
    handleCoverFileChange,
    handleUploadCoverForSelectedBook,
    handleDeleteCoverForSelectedBook,
  };
}
