/**
 * Settings → Recently deleted (S-D5, 2026-11-15): the household's deleted
 * books, newest first, each with Restore and Delete forever.
 *
 * Opening it purges what is past 30 days first (bookgeek's own API owns the
 * purge — it may delete files), then lists `deletedBooks` from the gateway.
 * Restore is the gateway's `restoreBook`; Delete forever is
 * `DELETE /api/books/:id/forever`. The list is small and read fresh each
 * time, so a change from the other device shows on the next open.
 */
import { useCallback, useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { useToast } from "@geeksuite/ui";
import { GET_DELETED_BOOKS } from "../graphql/queries.js";
import { purgeBookForever, purgeExpiredBooks, restoreBookRecord } from "./useBookActions";

export function useRecentlyDeleted() {
  const client = useApolloClient();
  const { notify } = useToast();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await purgeExpiredBooks();
      const { data } = await client.query({ query: GET_DELETED_BOOKS, fetchPolicy: "network-only" });
      setBooks(Array.isArray(data?.deletedBooks) ? data.deletedBooks : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const drop = (id) => setBooks((list) => list.filter((b) => b.id !== id));

  async function restore(book) {
    setBusyId(book.id);
    try {
      await restoreBookRecord(client, book.id);
      drop(book.id);
      notify(`Restored “${ book.title || "Untitled" }”`, { tone: "success" });
    } catch (err) {
      notify(err?.message || "Couldn't restore it.", { tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  /** Resolves true when it is gone, so the confirm can close. */
  async function deleteForever(book) {
    setBusyId(book.id);
    try {
      await purgeBookForever(book.id);
      drop(book.id);
      notify(`Deleted “${ book.title || "Untitled" }” for good`, { tone: "success" });
      return true;
    } catch (err) {
      notify(err?.message || "Couldn't delete it for good.", { tone: "error" });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return { books, loading, error, busyId, reload: load, restore, deleteForever };
}
