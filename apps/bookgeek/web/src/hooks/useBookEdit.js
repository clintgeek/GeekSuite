/**
 * The detail sheet's "Edit metadata" dialog: the draft, the save
 * (`updateBook` — the result updates `Book:<id>` in place, so the row in the
 * list changes with no refetch), and the library assistant's
 * `draftBookMetadata` fill (DOCS/AI_IDEAS.md #4). Nothing the draft does is
 * written until the user saves.
 */
import { useState } from "react";
import { useApolloClient } from "@apollo/client";
import { DRAFT_BOOK_METADATA } from "../graphql/queries.js";
import { mergeTagList } from "../utils/libraryAssistant";

export function useBookEdit({ selectedBook, updateBook }) {
  const apolloClient = useApolloClient();
  const [editMode, setEditMode] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [metadataDraftLoading, setMetadataDraftLoading] = useState(false);
  const [metadataDraftError, setMetadataDraftError] = useState(null);
  const [metadataDraftProvenance, setMetadataDraftProvenance] = useState(null);

  const bookId = selectedBook?.id || selectedBook?._id;

  function beginEditForSelectedBook() {
    if (!selectedBook) return;
    setEditError(null);
    setMetadataDraftError(null);
    setMetadataDraftProvenance(null);
    setEditDraft({
      title: selectedBook.title || "",
      description: selectedBook.description || "",
      authors: Array.isArray(selectedBook.authors) ? selectedBook.authors.join(", ") : "",
      language: selectedBook.language || "",
      publisher: selectedBook.publisher || "",
      publishedDate: selectedBook.publishedDate
        ? new Date(selectedBook.publishedDate).toISOString().slice(0, 10)
        : "",
      isbn: selectedBook.isbn || "",
      isbn13: selectedBook.isbn13 || "",
      goodreadsId: selectedBook.goodreadsId || "",
      tags: Array.isArray(selectedBook.tags) ? selectedBook.tags.join(", ") : "",
      review: selectedBook.review || "",
      rating:
        typeof selectedBook.rating === "number" && !Number.isNaN(selectedBook.rating)
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
    // The AI-drafted mark belongs to one dialog session, not to the book.
    setMetadataDraftLoading(false);
    setMetadataDraftError(null);
    setMetadataDraftProvenance(null);
  }

  async function handleSaveEditForSelectedBook() {
    if (!bookId || !editDraft) return;

    setEditSaving(true);
    setEditError(null);

    // `optionalTitleSchema` is `.optional()` but deliberately NOT
    // `.nullable()` (BURN_REVIEW #7), so a blank Title field used to send
    // `title: null` and lose the whole save — including every unrelated edit
    // in the same payload — behind an opaque "Invalid input".
    const trimmedTitle = typeof editDraft.title === "string" ? editDraft.title.trim() : "";
    if (!trimmedTitle) {
      setEditSaving(false);
      setEditError("Title is required.");
      return;
    }

    const splitList = (value) =>
      value
        ? value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [];

    const payload = {
      title: trimmedTitle,
      description: editDraft.description || null,
      language: editDraft.language || null,
      publisher: editDraft.publisher || null,
      publishedDate: editDraft.publishedDate || null,
      isbn: editDraft.isbn || null,
      isbn13: editDraft.isbn13 || null,
      goodreadsId: editDraft.goodreadsId || null,
      review: editDraft.review || null,
      authors: splitList(editDraft.authors),
      tags: splitList(editDraft.tags),
    };

    if (editDraft.rating !== undefined) {
      const ratingNumber = editDraft.rating === "" ? null : Number(editDraft.rating);
      if (ratingNumber !== null && Number.isFinite(ratingNumber)) {
        payload.rating = ratingNumber;
      }
    }

    try {
      await updateBook(bookId, payload, "Edit failed");
      setEditMode(false);
      setEditDraft(null);
    } catch (err) {
      setEditError(err.message || "Edit failed.");
    } finally {
      setEditSaving(false);
    }
  }

  /**
   * Fill the edit dialog's Description and Tags from `draftBookMetadata`.
   * Nothing is written here — the user reviews the draft and saves it through
   * the same `updateBook` the form has always used.
   */
  async function handleDraftMetadataForSelectedBook() {
    if (!bookId) return;
    setMetadataDraftLoading(true);
    setMetadataDraftError(null);
    try {
      const { data } = await apolloClient.query({
        query: DRAFT_BOOK_METADATA,
        variables: { bookId },
        fetchPolicy: "no-cache",
      });
      const draft = data?.draftBookMetadata;
      if (!draft) throw new Error("No draft came back.");
      setEditDraft((prev) => ({
        ...(prev || {}),
        // A drafted description replaces a blank field, never a written one:
        // the point is filling gaps an import left, not overwriting prose.
        description: (prev?.description || "").trim() ? prev.description : (draft.description || ""),
        tags: mergeTagList(prev?.tags, draft.tags),
      }));
      setMetadataDraftProvenance(draft.provenance || null);
    } catch (err) {
      setMetadataDraftError(err?.message || "Could not draft metadata.");
    } finally {
      setMetadataDraftLoading(false);
    }
  }

  return {
    editMode,
    editSaving,
    editError,
    editDraft,
    setEditDraft,
    beginEditForSelectedBook,
    cancelEditForSelectedBook,
    handleSaveEditForSelectedBook,
    metadataDraftLoading,
    metadataDraftError,
    metadataDraftProvenance,
    handleDraftMetadata: handleDraftMetadataForSelectedBook,
  };
}
