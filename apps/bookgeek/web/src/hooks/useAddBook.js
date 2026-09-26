/**
 * The Add-book dialog: `createBook` on the gateway, then (optionally) the
 * picked file to `POST /api/books/:id/upload`. On success the library's page 1
 * is refreshed IN PLACE (one request, merged — nothing loaded collapses) and
 * the new book opens at `/book/:id`.
 */
import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { CREATE_BOOK } from "../graphql/mutations.js";
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

  // `addBookFile` was cleared only on a successful create, so a picked-then-
  // cancelled file survived: reopening the dialog showed no file (the child's
  // own `fileName` resets on mount) while App still held the old one, and the
  // next Create silently attached an abandoned EPUB to a different book.
  // Keyed on the dialog closing, so every close path — Cancel, backdrop,
  // Escape — is covered.
  useEffect(() => {
    if (addBookOpen) return;
    setAddBookFile(null);
    setAddBookError(null);
  }, [addBookOpen]);

  async function handleCreateBook(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
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
        variables: { input: body },
      });

      const created = data.createBook || null;
      const createdId = created?.id || created?._id || null;

      if (createdId && addBookFile) {
        try {
          const formData = new FormData();
          formData.append("file", addBookFile);

          const uploadRes = await authFetch(`/books/${ createdId }/upload`, {
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
          writeRestBook(apolloClient.cache, uploadJson.data || null);
        } catch (uploadErr) {
          throw new Error(uploadErr.message || "Book created but failed to attach file");
        }
      }

      setAddBookOpen(false);
      setAddBookTitle("");
      setAddBookAuthors("");
      setAddBookIsbn("");
      setAddBookShelf("want-to-read");
      setAddBookFile(null);

      // The new book joins the current list where the server sorts it.
      await refreshLibraryList(apolloClient, params.search).catch(() => {});

      if (createdId) navigate(bookPath(createdId, params.search), { state: { fromLibrary: true } });
    } catch (err) {
      setAddBookError(err.message || "Failed to create book");
    } finally {
      setAddBookLoading(false);
    }
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
    handleCreateBook,
  };
}
