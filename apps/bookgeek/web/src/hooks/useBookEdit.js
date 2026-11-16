/**
 * The detail sheet's "Edit metadata" dialog: the draft, the save
 * (`updateBook` — the result updates `Book:<id>` in place, so the row in the
 * list changes with no refetch), and the library assistant's
 * `draftBookMetadata` fill (DOCS/AI_IDEAS.md #4). Nothing the draft does is
 * written until the user saves.
 */
import { useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { DRAFT_BOOK_METADATA } from "../graphql/queries.js";
import { mergeTagList } from "../utils/libraryAssistant";
import { calendarDayToIso, isoToCalendarDay } from "../utils/lastRead";

const splitList = (value) =>
  value
    ? value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    : [];

/** The draft as the `updateBook` input it would send (Last read aside). */
function draftToInput(draft) {
  const input = {
    title: typeof draft.title === "string" ? draft.title.trim() : "",
    description: draft.description || null,
    language: draft.language || null,
    publisher: draft.publisher || null,
    publishedDate: draft.publishedDate || null,
    isbn: draft.isbn || null,
    isbn13: draft.isbn13 || null,
    goodreadsId: draft.goodreadsId || null,
    review: draft.review || null,
    authors: splitList(draft.authors),
    myTags: splitList(draft.myTags),
  };
  if (draft.rating !== undefined) {
    const ratingNumber = draft.rating === "" ? null : Number(draft.rating);
    if (ratingNumber !== null && Number.isFinite(ratingNumber)) input.rating = ratingNumber;
  }
  return input;
}

/**
 * Only the fields the person changed in this dialog (SUITE_REVIEW_2026-11
 * BookGeek #6). Sending every field re-wrote title, description, publisher
 * and ISBN from the draft taken when the dialog opened, so an edit made
 * meanwhile on the other device — or by an enrich or cover job — was
 * silently reverted. Compared against the draft as it was opened, so a field
 * nobody touched is never sent.
 */
export function changedInput(draft, opened) {
  const next = draftToInput(draft);
  const before = opened ? draftToInput(opened) : {};
  const out = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(before[key])) out[key] = value;
  }
  return out;
}

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
  // The draft exactly as the dialog opened: the baseline `changedInput` diffs.
  const openedDraftRef = useRef(null);

  function beginEditForSelectedBook() {
    if (!selectedBook) return;
    setEditError(null);
    setMetadataDraftError(null);
    setMetadataDraftProvenance(null);
    const opened = {
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
      // The reader's own tags (DOCS/TAGS.md §4). The imported `tags` are not
      // editable here: Calibre owns them, and a re-import would undo an edit.
      myTags: Array.isArray(selectedBook.myTags) ? selectedBook.myTags.join(", ") : "",
      review: selectedBook.review || "",
      rating:
        typeof selectedBook.rating === "number" && !Number.isNaN(selectedBook.rating)
          ? String(selectedBook.rating)
          : "",
      // "Last read" (`dateFinished`) as the date input's YYYY-MM-DD, on the
      // day the detail page shows it (utils/lastRead.js).
      dateFinished: isoToCalendarDay(selectedBook.dateFinished),
    };
    openedDraftRef.current = opened;
    setEditDraft(opened);
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

    const payload = changedInput(editDraft, openedDraftRef.current);

    // Last read: sent only when the day changed in this dialog, as that
    // day's UTC midnight ("" clears). An untouched field never rounds a real
    // instant off, nor puts back a day another device has since changed.
    const openedDay = openedDraftRef.current
      ? openedDraftRef.current.dateFinished || ""
      : isoToCalendarDay(selectedBook?.dateFinished);
    if (editDraft.dateFinished !== undefined && (editDraft.dateFinished || "") !== openedDay) {
      const iso = calendarDayToIso(editDraft.dateFinished);
      if (editDraft.dateFinished && !iso) {
        setEditSaving(false);
        setEditError("Last read isn't a valid date.");
        return;
      }
      payload.dateFinished = iso;
    }

    // Nothing changed: close without a write.
    if (Object.keys(payload).length === 0) {
      setEditSaving(false);
      setEditMode(false);
      setEditDraft(null);
      return;
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
   * Fill the edit dialog's Description and My tags from `draftBookMetadata`.
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
        // Drafted tags join the reader's own: nothing is saved until they
        // save, and what they save is theirs.
        myTags: mergeTagList(prev?.myTags, draft.tags),
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
