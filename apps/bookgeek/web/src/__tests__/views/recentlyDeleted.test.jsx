/**
 * Recently deleted (SUITE_REVIEW_2026-11 S-D5, 2026-11-15), end to end
 * through the real shell and a scripted gateway:
 *
 *   - Settings lists the trash (after asking the api to purge what is past
 *     30 days), and Restore puts a book back in the library list;
 *   - Delete forever asks first, then goes to DELETE /api/books/:id/forever;
 *   - a delete from the book sheet says where the book went, with Undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestClient, libraryServer, makeBook, renderSignedIn, stubFetch, stubIntersectionObserver } from "../appHarness";

vi.setConfig({ testTimeout: 120000 });

// Keep every toast up (no auto-hide timer) so the test is about behaviour.
vi.mock("@geeksuite/ui", async (importOriginal) => {
  const ui = await importOriginal();
  const { useMemo } = await import("react");
  return {
    ...ui,
    useToast: () => {
      const toast = ui.useToast();
      return useMemo(
        () => ({ ...toast, notify: (message, options = {}) => toast.notify(message, { ...options, duration: 0 }) }),
        [toast]
      );
    },
  };
});

beforeEach(() => { stubIntersectionObserver(); });
afterEach(() => { vi.unstubAllGlobals(); });

const DELETED_AT = "2026-11-10T12:00:00.000Z";
const PURGE_AT = "2026-12-10T12:00:00.000Z";

/** libraryServer plus a trash: deleteBook marks, restoreBook unmarks. */
function trashServer(books, trashed) {
  const { db, handlers } = libraryServer(books);
  db.trash = trashed.map((b) => ({ ...b, deletedAt: DELETED_AT, purgeAt: PURGE_AT, deleteFilesOnPurge: false }));
  return {
    db,
    handlers: {
      ...handlers,
      GetDeletedBooks: () => ({ deletedBooks: db.trash }),
      RestoreBook: (v) => {
        const i = db.trash.findIndex((b) => b.id === v.id);
        if (i < 0) return { restoreBook: null };
        const [book] = db.trash.splice(i, 1);
        const live = { ...book };
        delete live.deletedAt;
        delete live.purgeAt;
        delete live.deleteFilesOnPurge;
        db.books.push(live);
        return { restoreBook: live };
      },
      DeleteBook: (v) => {
        const i = db.books.findIndex((b) => b.id === v.id);
        if (i >= 0) db.trash.unshift({ ...db.books.splice(i, 1)[0], deletedAt: DELETED_AT, purgeAt: PURGE_AT, deleteFilesOnPurge: false });
        return { deleteBook: { __typename: "DeleteBookResponse", success: i >= 0, deletedId: v.id } };
      },
    },
  };
}

const rows = () => screen.queryAllByRole("button", { name: /^Book \d{3}$/, hidden: true });

describe("Settings → Recently deleted", () => {
  it("purges what is past 30 days, lists the trash, and Restore puts the book back in the library", async () => {
    const fetchMock = stubFetch((url, options) =>
      options.method === "POST" && url.endsWith("/books/trash/purge-expired")
        ? new Response(JSON.stringify({ success: true, data: { purged: 0 } }), { status: 200 })
        : null
    );
    const { db, handlers } = trashServer([makeBook(1)], [makeBook(2, { title: "Dune" })]);
    const { client, calls } = createTestClient(handlers);
    const user = userEvent.setup();
    const { router } = renderSignedIn({ client, initialEntries: ["/settings"] });

    const list = await screen.findByRole("list", { name: "Recently deleted books" }, { timeout: 20000 });
    expect(within(list).getByText("Dune")).toBeInTheDocument();
    expect(within(list).getByText(/gone for good/)).toBeInTheDocument();
    // The purge ran before the list was read.
    const purgeAt = fetchMock.mock.calls.findIndex(([u, o]) => o?.method === "POST" && String(u).endsWith("/books/trash/purge-expired"));
    expect(purgeAt).toBeGreaterThanOrEqual(0);

    await user.click(within(list).getByRole("button", { name: "Restore “Dune”" }));
    await waitFor(() => expect(calls.filter((c) => c.name === "RestoreBook").map((c) => c.variables.id)).toEqual(["b002"]));
    expect(await screen.findByText("Nothing deleted in the last 30 days.")).toBeInTheDocument();
    expect(db.books.map((b) => b.id).sort()).toEqual(["b001", "b002"]);

    // Back in the library.
    router.navigate("/");
    await waitFor(() => expect(screen.getByRole("button", { name: "Dune" })).toBeInTheDocument());
  });

  it("Delete forever asks first, then goes to the api's /forever route", async () => {
    const fetchMock = stubFetch((url, options) => {
      if (options.method === "DELETE" && url.endsWith("/books/b002/forever")) {
        return new Response(JSON.stringify({ success: true, data: { purgedId: "b002" } }), { status: 200 });
      }
      if (options.method === "POST") return new Response(JSON.stringify({ success: true, data: { purged: 0 } }), { status: 200 });
      return null;
    });
    const { handlers } = trashServer([makeBook(1)], [makeBook(2, { title: "Dune" })]);
    const { client } = createTestClient(handlers);
    const user = userEvent.setup();
    renderSignedIn({ client, initialEntries: ["/settings"] });

    const list = await screen.findByRole("list", { name: "Recently deleted books" }, { timeout: 20000 });
    await user.click(within(list).getByRole("button", { name: "Delete “Dune” forever" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete forever?" });
    expect(within(confirm).getByText(/cannot be undone/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(false);

    await user.click(within(confirm).getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, o]) => o?.method === "DELETE" && String(u).endsWith("/books/b002/forever"))).toBe(true));
    expect(await screen.findByText("Nothing deleted in the last 30 days.")).toBeInTheDocument();
  });
});

describe("deleting from the book sheet", () => {
  it("says the book moved to Recently deleted, and Undo restores it into the list", async () => {
    stubFetch();
    const { handlers } = trashServer(Array.from({ length: 3 }, (_, i) => makeBook(i + 1)), []);
    const { client, calls } = createTestClient(handlers);
    const user = userEvent.setup();
    renderSignedIn({ client });
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(screen.getByRole("button", { name: "Book 002" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Delete book…"));
    const confirm = await screen.findByRole("dialog", { name: /delete this book/i });
    expect(within(confirm).getByText(/restore it from Settings for 30 days/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(await screen.findByText("“Book 002” moved to Recently deleted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo", hidden: true }));
    await waitFor(() => expect(calls.filter((c) => c.name === "RestoreBook")).toHaveLength(1));
    await waitFor(() => expect(rows()).toHaveLength(3));
  });
});
