/**
 * "Also delete files" (found in Phase A of DOCS/BOOKGEEK_CLEANUP_PLAN.md): the
 * checkbox used to do nothing, because the gateway's `deleteBook` ignores
 * `deleteFiles`. Checked, the sheet now calls bookgeek's own
 * `DELETE /api/books/:id?deleteFiles=true` — which removes the files (confined
 * to LIBRARY_PATH) AND the record — instead of the gateway mutation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createTestClient,
  libraryServer,
  makeBook,
  renderSignedIn,
  stubFetch,
  stubIntersectionObserver,
} from "../appHarness";

const rows = () => screen.queryAllByRole("button", { name: /^Book \d{3}$/, hidden: true });

vi.setConfig({ testTimeout: 180000 });

beforeEach(() => {
  stubIntersectionObserver();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function deleteFromSheet(user, name, { withFiles }) {
  await user.click(screen.getByRole("button", { name }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByText("Delete book…"));
  const confirm = await screen.findByRole("dialog", { name: /delete this book/i });
  if (withFiles) await user.click(within(confirm).getByRole("checkbox", { name: /also delete files/i }));
  await user.click(within(confirm).getByRole("button", { name: "Delete" }));
}

describe('delete with "Also delete files"', () => {
  it('"Also delete files" goes to DELETE /api/books/:id?deleteFiles=true, not the gateway', async () => {
    const { db, handlers } = libraryServer(Array.from({ length: 5 }, (_, i) => makeBook(i + 1)));
    const fetchMock = stubFetch((url, options) => {
      if (options.method === "DELETE" && /\/books\/b003\?deleteFiles=true$/.test(url)) {
        db.books = db.books.filter((b) => b.id !== "b003");
        return new Response(
          JSON.stringify({ success: true, data: { deletedId: "b003", deleteFilesRequested: true, filesDeleted: 1, filesFailed: 0 } }),
          { status: 200 }
        );
      }
      return null;
    });
    const { client, count } = createTestClient(handlers);
    const user = userEvent.setup();
    renderSignedIn({ client });
    await waitFor(() => expect(rows()).toHaveLength(5));

    await deleteFromSheet(user, "Book 003", { withFiles: true });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const del = fetchMock.mock.calls.find(([, o]) => o?.method === "DELETE");
    expect(del[0]).toMatch(/\/api\/books\/b003\?deleteFiles=true$/);
    expect(del[1].credentials).toBe("include");
    expect(count("DeleteBook")).toBe(0);
    expect(rows()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Book 003" })).not.toBeInTheDocument();
  });

  it("a failed files delete keeps the sheet open, says why, and leaves the list alone", async () => {
    stubFetch((url, options) =>
      options.method === "DELETE"
        ? new Response(JSON.stringify({ error: "Database not connected" }), { status: 503 })
        : null
    );
    const { handlers } = libraryServer(Array.from({ length: 3 }, (_, i) => makeBook(i + 1)));
    const { client, count } = createTestClient(handlers);
    const user = userEvent.setup();
    renderSignedIn({ client });
    await waitFor(() => expect(rows()).toHaveLength(3));

    await deleteFromSheet(user, "Book 002", { withFiles: true });

    expect(await screen.findByText("Database not connected")).toBeInTheDocument();
    expect(count("DeleteBook")).toBe(0);
    expect(rows()).toHaveLength(3);
  });
});
