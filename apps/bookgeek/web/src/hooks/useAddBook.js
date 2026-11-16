/**
 * The Add-book dialog: `createBook` on the gateway, then (optionally) the
 * picked file to `POST /api/books/:id/upload`. On success the library's page 1
 * is refreshed IN PLACE (one request, merged — nothing loaded collapses) and
 * the new book opens at `/book/:id`.
 *
 * Create is not repeated: once the book exists, a retry runs only the steps
 * still owed (the Manga/Comic tag, the upload) against the same id.
 */
import { useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { CREATE_BOOK, UPDATE_BOOK } from "../graphql/mutations.js";
import { COMIC_KIND_TAGS } from "../utils/comic";
import { refreshLibraryList, writeRestBook } from "../graphql/cachePolicies.js";
import { authFetch } from "../utils/authFetch";
import { bookPath } from "../components/navConfig";

export function useAddBook({ params }) {
  const apolloClient = useApolloClient();
  const navigate = useNavigate();
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [addBookLoading, setAddBookLoading] = useState(false);
  const [addBookError, setAddBookError] = useState(null);
  const [addBookTitle, setAddBookTitle] = useState("");
  const [addBookAuthors, setAddBookAuthors] = useState("");
  const [addBookIsbn, setAddBookIsbn] = useState("");
  const [addBookShelf, setAddBookShelf] = useState("want-to-read");
  const [addBookFile, setAddBookFile] = useState(null);
  // "" | "manga" | "comic" — the dialog's Manga / Comic choice.
  const [addBookKind, setAddBookKind] = useState("");

  // Once `createBook` has answered, the book EXISTS. A later step failing (the
  // Manga/Comic tag, or the file upload — a big EPUB on a phone connection, a
  // 413, a timeout) must not send the user back through `createBook`: before
  // 2026-11-15 the dialog stayed open with "Create" as its only button, and a
  // second tap made a second book (SUITE_REVIEW_2026-11 BookGeek #1). So the
  // created id and the steps already done are kept, and a retry runs only
  // the steps still owed. `addBookCreatedId` is state (the dialog reads it to
  // say what happened); the ref is what the handler reads, so a double tap
  // inside one render cannot slip past it.
  const [addBookCreatedId, setAddBookCreatedId] = useState(null);
  const progressRef = useRef({ id: null, tagged: false });

  // `addBookFile` was cleared only on a successful create, so a picked-then-
  // cancelled file survived: reopening the dialog showed no file (the child's
  // own `fileName` resets on mount) while App still held the old one, and the
  // next Create silently attached an abandoned EPUB to a different book.
  // Keyed on the dialog closing, so every close path — Cancel, backdrop,
  // Escape — is covered. A half-finished book is forgotten here too: it is in
  // the library already (the list was refreshed when it was created).
  useEffect(() => {
    if (addBookOpen) return;
    setAddBookFile(null);
    setAddBookError(null);
    setAddBookKind("");
    setAddBookCreatedId(null);
    progressRef.current = { id: null, tagged: false };
  }, [addBookOpen]);

  function resetForm() {
    setAddBookOpen(false);
    setAddBookTitle("");
    setAddBookAuthors("");
    setAddBookIsbn("");
    setAddBookShelf("want-to-read");
    setAddBookFile(null);
  }

  async function handleCreateBook(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    const title = addBookTitle.trim();
    if (!progressRef.current.id && !title) {
      setAddBookError("Title is required.");
      return;
    }

    setAddBookLoading(true);
    setAddBookError(null);
    try {
      let createdId = progressRef.current.id;

      if (!createdId) {
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
          variables: { input: body },
        });

        const created = data.createBook || null;
        createdId = created?.id || created?._id || null;
        if (createdId) {
          progressRef.current = { id: createdId, tagged: false };
          setAddBookCreatedId(createdId);
          // It is in the library now, whatever happens next.
          refreshLibraryList(apolloClient, params.search).catch(() => {});
        }
      }

      // Manga / Comic: `createBook` takes no tags, so the tag goes on with a
      // second call. It is the shared `tags` (a fact about the book, seen by
      // every reader), not the caller's own `myTags`. Setting it twice is
      // harmless, but a retry skips it once it has landed.
      const kindTag = COMIC_KIND_TAGS[addBookKind];
      if (createdId && kindTag && !progressRef.current.tagged) {
        try {
          await apolloClient.mutate({
            mutation: UPDATE_BOOK,
            variables: { id: createdId, input: { tags: [kindTag] } },
          });
          progressRef.current.tagged = true;
        } catch {
          throw new Error(`The book is in your library, but it could not be marked as ${ kindTag }. Retry, or add the tag from Edit metadata.`);
        }
      }

      if (createdId && addBookFile) {
        let uploadJson = null;
        try {
          const formData = new FormData();
          formData.append("file", addBookFile);

          const uploadRes = await authFetch(`/books/${ createdId }/upload`, {
            method: "POST",
            body: formData,
          });
          uploadJson = await uploadRes.json().catch(() => null);
          if (!uploadRes.ok || uploadJson?.success === false) {
            throw new Error(
              uploadJson?.error?.message ||
              uploadJson?.message ||
              (uploadRes.status === 413 ? "the file is too big to upload" : `upload failed (${ uploadRes.status })`),
            );
          }
        } catch (uploadErr) {
          const reason = uploadErr?.message ? ` (${ uploadErr.message })` : "";
          throw new Error(`The book is in your library, but the file did not attach${ reason }. Retry the upload, or open the book and attach it there.`);
        }
        writeRestBook(apolloClient.cache, uploadJson?.data || null);
      }

      resetForm();

      // The new book joins the current list where the server sorts it.
      await refreshLibraryList(apolloClient, params.search).catch(() => {});

      if (createdId) navigate(bookPath(createdId, params.search), { state: { fromLibrary: true } });
    } catch (err) {
      setAddBookError(err.message || "Failed to create book");
    } finally {
      setAddBookLoading(false);
    }
  }

  /** After a failed step: give up on the file/tag and open the book that was made. */
  function openCreatedBook() {
    const id = progressRef.current.id;
    resetForm();
    if (id) navigate(bookPath(id, params.search), { state: { fromLibrary: true } });
  }

  return {
    addBookOpen,
    setAddBookOpen,
    addBookLoading,
    addBookError,
    addBookTitle,
    setAddBookTitle,
    addBookAuthors,
    setAddBookAuthors,
    addBookIsbn,
    setAddBookIsbn,
    addBookShelf,
    setAddBookShelf,
    setAddBookFile,
    addBookKind,
    setAddBookKind,
    addBookCreatedId,
    openCreatedBook,
    handleCreateBook,
  };
}
