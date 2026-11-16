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
import { DELETE_BOOK, RESTORE_BOOK, UPDATE_BOOK } from "../graphql/mutations.js";
import {
  applyShelfChangeToLists,
  patchBook,
  refreshLibraryList,
  removeBookFromLists,
  writeRestBook,
} from "../graphql/cachePolicies.js";
import { authFetch, restErrorMessage } from "../utils/authFetch";
import { createRateBook } from "../utils/rateBook";
import { shelfMoveInput } from "../utils/lastRead";

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
 * "Delete forever" from Recently deleted: bookgeek's own API, because the
 * purge may remove files (only it can reach the library folder). Refuses a
 * book that is not in the trash. Resolves to the purged id.
 */
export async function purgeBookForever(bookId) {
  const res = await authFetch(`/books/${ encodeURIComponent(bookId) }/forever`, { method: "DELETE" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    throw new Error(restErrorMessage(json, "Couldn't delete it for good"));
  }
  return String(json.data?.purgedId || bookId);
}

/**
 * Opening Recently deleted first purges what is past 30 days (NoteGeek's
 * lazy rule; services/bookTrash.js). Best effort: a failure only means the
 * list may show a book a little past its date.
 */
export async function purgeExpiredBooks() {
  try {
    await authFetch("/books/trash/purge-expired", { method: "POST" });
  } catch {
    // ignore: the next delete or the api's boot purge catches up
  }
}

/**
 * Bring a book back from Recently deleted, and put it back in the loaded
 * library list (refreshed in place) and the shelf counts.
 */
export async function restoreBookRecord(client, bookId, { search = "" } = {}) {
  const res = await client.mutate({ mutation: RESTORE_BOOK, variables: { id: bookId } });
  const restored = res.data?.restoreBook;
  if (!restored) throw new Error("That book can't be restored — it may have been deleted for good.");
  await refreshLibraryList(client, search).catch(() => {});
  await refreshShelfSummary(client);
  return restored;
}

/**
 * Delete a book — since 2026-11-15 that means "move to Recently deleted";
 * both paths below only mark it. "Also delete files" goes to bookgeek's own
 * `DELETE /api/books/:id?deleteFiles=true`, which remembers to remove the
 * files at the purge (confined to LIBRARY_PATH) and runs the lazy purge of
 * anything past 30 days. Without it, the gateway's `deleteBook`. Resolves to
 * the deleted id; throws with a message the confirm dialog shows.
 */
export async function deleteBookRecord(client, bookId, { deleteFiles = false } = {}) {
  if (deleteFiles) {
    const res = await authFetch(`/books/${ encodeURIComponent(bookId) }?deleteFiles=true`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.success === false) {
      throw new Error(restErrorMessage(json, "Delete failed"));
    }
    return String(json.data?.deletedId || bookId);
  }
  const apolloRes = await client.mutate({
    mutation: DELETE_BOOK,
    variables: { id: bookId, deleteFiles: false },
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

  /**
   * Move a book to a shelf ("" clears it). Resolves to the updated book.
   * Moving to `read` with no last-read date sets it to today in the same
   * mutation (utils/lastRead.js `shelfMoveInput`) — every caller gets that,
   * so the toast is each caller's job, not the date. `extra` rides along in
   * the same update (Undo restoring a previous `dateFinished`).
   */
  const updateShelf = useCallback(
    async (book, newShelf, extra) => {
      const { input } = shelfMoveInput(book, newShelf, extra);
      const updated = await updateBook(bookIdOf(book), input, "Failed to update shelf");
      applyShelfChangeToLists(client.cache, updated);
      await refreshShelfSummary(client);
      return updated;
    },
    [client, updateBook]
  );

  /**
   * Set or clear a book's last-read date (`dateFinished`): a day the reader
   * picked, already UTC midnight (utils/lastRead.js), or null. A date takes a
   * book out of the Unread list, so the lists are checked like a shelf move.
   */
  const setLastRead = useCallback(
    async (book, iso) => {
      const updated = await updateBook(bookIdOf(book), { dateFinished: iso ?? null }, "Couldn't save the last-read date");
      applyShelfChangeToLists(client.cache, updated);
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

  return { client, updateBook, updateShelf, setLastRead, deleteBook, writeBook };
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
