/**
 * The writes that change a book, shared by the library, the What-next shelf
 * and the detail sheet. Every one updates the Apollo cache IN PLACE — the
 * mutation's `Book` result normalizes over `Book:<id>`, so every row showing
 * it re-renders — and none of them refetches the list. That is the rule that
 * keeps a scrolled-down library from snapping back to page 1 after an edit
 * (GameGeek's lesson of 2026-09-25; graphql/cachePolicies.js).
 */
import { useCallback, useMemo } from "react";
import { useApolloClient } from "@apollo/client";
import { GET_SHELVES } from "../graphql/queries.js";
import { DELETE_BOOK, UPDATE_BOOK } from "../graphql/mutations.js";
import {
  applyShelfChangeToLists,
  patchBook,
  removeBookFromLists,
  writeRestBook,
} from "../graphql/cachePolicies.js";
import { createRateBook } from "../utils/rateBook";

export const bookIdOf = (book) => book?.id || book?._id || null;

/** The shelf counts are cosmetic; a failed refresh is ignored. */
export async function refreshShelfSummary(client) {
  try {
    await client.query({ query: GET_SHELVES, fetchPolicy: "network-only" });
  } catch {
    // counts are cosmetic; ignore refresh errors
  }
}

/**
 * Delete a book through the gateway's `deleteBook`. Resolves to the deleted
 * id; throws with a message the confirm dialog shows.
 */
export async function deleteBookRecord(client, bookId, { deleteFiles = false } = {}) {
  const apolloRes = await client.mutate({
    mutation: DELETE_BOOK,
    variables: { id: bookId, deleteFiles },
  });
  if (!apolloRes.data?.deleteBook?.success) {
    throw new Error("Delete failed");
  }
  return String(apolloRes.data.deleteBook.deletedId || bookId);
}

export function useBookActions() {
  const client = useApolloClient();

  const updateBook = useCallback(
    async (bookId, input, failure = "Update failed") => {
      const res = await client.mutate({ mutation: UPDATE_BOOK, variables: { id: bookId, input } });
      const updated = res.data?.updateBook;
      if (!updated) throw new Error(failure);
      return updated;
    },
    [client]
  );

  /** Move a book to a shelf ("" clears it). Resolves to the updated book. */
  const updateShelf = useCallback(
    async (book, newShelf) => {
      const updated = await updateBook(bookIdOf(book), { shelf: newShelf }, "Failed to update shelf");
      applyShelfChangeToLists(client.cache, updated);
      await refreshShelfSummary(client);
      return updated;
    },
    [client, updateBook]
  );

  const deleteBook = useCallback(
    async (bookId, { deleteFiles = false, beforeEvict } = {}) => {
      const deletedId = await deleteBookRecord(client, bookId, { deleteFiles });
      beforeEvict?.(deletedId);
      removeBookFromLists(client.cache, deletedId);
      await refreshShelfSummary(client);
      return deletedId;
    },
    [client]
  );

  /** A book a REST route answered with (enrich, covers, upload), into the cache. */
  const writeBook = useCallback((raw) => writeRestBook(client.cache, raw), [client]);

  return { client, updateBook, updateShelf, deleteBook, writeBook };
}

/**
 * Set a book's rating from the grid or the list — one tap, no dialog.
 * Optimistic, rolled back on failure, and safe against out-of-order
 * responses; all of that lives in utils/rateBook.js where it is tested.
 * `rating` may be null, which clears — how Undo restores "not rated".
 * One per session (its per-book sequence map must be shared), so it is
 * built in hooks/useBookGeek.jsx.
 */
export function useRateBook() {
  const client = useApolloClient();
  return useMemo(
    () =>
      createRateBook({
        save: async (id, rating) => {
          const res = await client.mutate({
            mutation: UPDATE_BOOK,
            variables: { id, input: { rating } },
          });
          return res.data?.updateBook ?? null;
        },
        apply: (id, patch) => patchBook(client.cache, id, patch),
      }),
    [client]
  );
}
