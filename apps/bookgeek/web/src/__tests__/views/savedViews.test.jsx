/**
 * Saved views in the sidebar, end to end through the real shell: a view made
 * before Phase C2 (legacy fields only) opens the list its old "apply" did —
 * the URL, and the `filter` GetBooks is asked for; the row lights while the
 * list shows exactly it; ⋯ → Delete view removes it from the gateway and the
 * sidebar at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestClient, libraryServer, makeBook, renderSignedIn, stubFetch, stubIntersectionObserver } from "../appHarness";
import { SAVED_FILTERS } from "../fixtures";

vi.setConfig({ testTimeout: 60000 });

beforeEach(() => {
  stubIntersectionObserver();
  stubFetch();
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const { handlers } = libraryServer([makeBook(1, { shelf: "unread" }), makeBook(2, { shelf: "on-reader" })]);
  let views = [...SAVED_FILTERS];
  handlers.GetLibraryFilters = () => ({ libraryFilters: views });
  handlers.DeleteLibraryFilter = (v) => {
    views = views.filter((x) => x.id !== v.id);
    return { deleteLibraryFilter: views };
  };
  return createTestClient(handlers);
}

describe("saved views", () => {
  it("a legacy view opens its old list, and lights while the list is exactly it", async () => {
    const { client, calls } = setup();
    const user = userEvent.setup();
    const { router } = renderSignedIn({ client });
    const nav = await screen.findByRole("region", { name: "Saved views" });
    const link = await within(nav).findByRole("link", { name: "Unread sci-fi" });

    await user.click(link);
    // The saved raw "science fiction" opens as the gateway maps it (viewTags).
    expect(router.location.search).toBe("?q=robot&shelf=unread&tag=Sci-fi&by=Asimov&sort=dateAdded");
    await waitFor(() =>
      expect(calls.filter((c) => c.name === "GetBooks").at(-1).variables).toEqual({
        page: 1,
        limit: 50,
        sort: "dateAdded",
        sortDir: "desc",
        filter: { q: "robot", shelves: ["unread"], tags: ["Sci-fi"], authorText: "Asimov" },
      })
    );
    expect(within(nav).getByRole("link", { name: "Unread sci-fi" })).toHaveAttribute("aria-current", "page");
    // The chips say what it narrowed by, the old author "contains" included.
    expect(screen.getByRole("button", { name: "Remove Author contains: “Asimov”" })).toBeInTheDocument();
  });

  it("⋯ → Delete view removes it", async () => {
    const { client, count } = setup();
    const user = userEvent.setup();
    renderSignedIn({ client });
    const nav = await screen.findByRole("region", { name: "Saved views" });
    await user.click(await within(nav).findByRole("button", { name: "Options for Kindle queue" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete view" }));
    await waitFor(() => expect(count("DeleteLibraryFilter")).toBe(1));
    await waitFor(() => expect(within(nav).queryByRole("link", { name: "Kindle queue" })).not.toBeInTheDocument());
    expect(within(nav).getByRole("link", { name: "Unread sci-fi" })).toBeInTheDocument();
  });
});
