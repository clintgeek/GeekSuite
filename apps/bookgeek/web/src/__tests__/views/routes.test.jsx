/**
 * The Phase B routes and the cached book list, end to end through the real
 * shell: `/book/:id` deep links and Back, edits that keep every loaded page
 * (the no-collapse regression GameGeek hit on 2026-09-25), shelf moves that
 * leave a filtered list in place, and delete (record only; "Also delete
 * files" is deleteFiles.test.jsx).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  PAGE,
  createTestClient,
  libraryServer,
  makeBook,
  renderSignedIn,
  stubFetch,
  stubIntersectionObserver,
} from "../appHarness";
import { patchBook } from "../../graphql/cachePolicies";
import { UPDATE_BOOK } from "../../graphql/mutations";
import { BOOK_FIELDS } from "../../graphql/queries";

// `hidden: true`: while the sheet is up the grid under it is aria-hidden.
const rows = () => screen.queryAllByRole("button", { name: /^Book \d{3}$/, hidden: true });

// Fifty-odd MUI cards per page in jsdom is slow; these walk real pages.
vi.setConfig({ testTimeout: 180000 });

async function openMore(user) {
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "More actions" }));
}

let io;
beforeEach(() => {
  io = stubIntersectionObserver();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routes", () => {
  it("a deep link to /book/:id loads that book's sheet over the library", async () => {
    stubFetch();
    // b120 is on page 3, so the library's first page does not hold it and the
    // sheet has to ask the gateway for it.
    const { handlers } = libraryServer(Array.from({ length: 150 }, (_, i) => makeBook(i + 1)));
    const { client, count } = createTestClient(handlers);
    const { router } = renderSignedIn({ client, initialEntries: ["/book/b120"] });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Book 120").length).toBeGreaterThan(0);
    expect(count("GetBook")).toBe(1);
    expect(router.location.pathname).toBe("/book/b120");
    // …and the library is mounted underneath it.
    await waitFor(() => expect(rows().length).toBe(PAGE));
  });

  it("opening a card pushes /book/:id with the filters; Back closes the sheet", async () => {
    stubFetch();
    const { handlers } = libraryServer(Array.from({ length: 3 }, (_, i) => makeBook(i + 1)));
    const { client, count } = createTestClient(handlers);
    const user = userEvent.setup();
    const { router } = renderSignedIn({ client, initialEntries: ["/?q=Book"] });

    const card = await screen.findByRole("button", { name: "Book 002" });
    await user.click(card);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(router.location.pathname).toBe("/book/b002");
    expect(router.location.search).toBe("?q=Book");
    // Answered from the row the library holds — no extra request.
    expect(count("GetBook")).toBe(0);

    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.location.pathname).toBe("/");
    expect(router.location.search).toBe("?q=Book");
    // The library under the sheet was never unmounted: the very same card
    // element is still in the page (so its scroll position was never lost).
    expect(card.isConnected).toBe(true);
    expect(screen.getByRole("button", { name: "Book 002" })).toBe(card);
  });

  it("a deep link to a book that does not exist falls back to the library", async () => {
    stubFetch();
    const { handlers } = libraryServer([makeBook(1)]);
    const { client } = createTestClient(handlers);
    const { router } = renderSignedIn({ client, initialEntries: ["/book/nope"] });
    await waitFor(() => expect(router.location.pathname).toBe("/"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("/settings is its own route, and the filters survive the round trip", async () => {
    stubFetch();
    const { handlers } = libraryServer([makeBook(1)]);
    const { client } = createTestClient(handlers);
    const { router } = renderSignedIn({ client, initialEntries: ["/?shelf=reading"] });
    await screen.findByRole("button", { name: "Book 001" });
    await act(async () => router.navigate("/settings?shelf=reading"));
    expect(await screen.findByText(/send to device/i)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });
});

describe("the cached book list", () => {
  it("an edit keeps all three loaded pages and never refetches the list (no collapse)", async () => {
    stubFetch();
    const { handlers } = libraryServer(Array.from({ length: 150 }, (_, i) => makeBook(i + 1)));
    const { client, count } = createTestClient(handlers);
    const user = userEvent.setup();
    const { router } = renderSignedIn({ client });

    await waitFor(() => expect(rows()).toHaveLength(50));
    await io.scrollSentinel();
    await waitFor(() => expect(rows()).toHaveLength(100));
    await io.scrollSentinel();
    await waitFor(() => expect(rows()).toHaveLength(150));
    expect(count("GetBooks")).toBe(3);

    // Edit a book from page 3 through the real sheet → More → Edit metadata.
    await user.click(screen.getByRole("button", { name: "Book 140" }));
    await openMore(user);
    await user.click(await screen.findByText("Edit metadata"));
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Renamed" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(count("UpdateBook")).toBe(1));

    // Close the sheet (Back); the grid underneath still has every row.
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(rows()).toHaveLength(149);
    expect(screen.getByRole("button", { name: "Renamed" })).toBeInTheDocument();
    expect(count("GetBooks")).toBe(3);
  });

  it("a rating from the grid updates the row in place with no list request", async () => {
    stubFetch();
    const { handlers } = libraryServer(Array.from({ length: 60 }, (_, i) => makeBook(i + 1)));
    const { client, count } = createTestClient(handlers);
    renderSignedIn({ client });
    await waitFor(() => expect(rows()).toHaveLength(50));
    await io.scrollSentinel();
    await waitFor(() => expect(rows()).toHaveLength(60));

    // The same path the grid's stars take (hooks/useBookActions → rateBook).
    await act(async () => {
      patchBook(client.cache, "b055", { rating: 5 });
      await client.mutate({ mutation: UPDATE_BOOK, variables: { id: "b055", input: { rating: 5 } } });
    });
    expect(rows()).toHaveLength(60);
    expect(count("GetBooks")).toBe(2);
    expect(client.cache.readFragment({ id: "Book:b055", fragment: BOOK_FIELDS, fragmentName: "BookFields" }).rating).toBe(5);
  });

  it("a shelf move leaves a filtered list without reloading it", async () => {
    stubFetch();
    const books = Array.from({ length: 70 }, (_, i) => makeBook(i + 1));
    const { handlers } = libraryServer(books);
    const { client, count } = createTestClient(handlers);
    const user = userEvent.setup();
    renderSignedIn({ client, initialEntries: ["/?shelf=reading"] });

    await waitFor(() => expect(rows()).toHaveLength(50));
    await io.scrollSentinel();
    await waitFor(() => expect(rows()).toHaveLength(70));
    const listRequests = count("GetBooks");

    await user.click(screen.getByRole("button", { name: "Book 065" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Shelf" }));
    const sheet = await screen.findByRole("dialog", { name: "Shelf" });
    await user.click(within(sheet).getByText("Read"));
    await waitFor(() => expect(count("UpdateBook")).toBe(1));

    await waitFor(() => expect(rows()).toHaveLength(69));
    expect(screen.queryByRole("button", { name: "Book 065" })).not.toBeInTheDocument();
    expect(screen.getByText("69 books")).toBeInTheDocument();
    expect(count("GetBooks")).toBe(listRequests);
  });
});

describe("delete", () => {
  async function deleteFromSheet(user, name, { withFiles }) {
    await user.click(screen.getByRole("button", { name }));
    await openMore(user);
    await user.click(await screen.findByText("Delete book…"));
    const confirm = await screen.findByRole("dialog", { name: /delete this book/i });
    if (withFiles) await user.click(within(confirm).getByRole("checkbox", { name: /also delete files/i }));
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
  }

  it("evicts the book from the list and closes the sheet (gateway, record only)", async () => {
    const fetchMock = stubFetch();
    const { handlers } = libraryServer(Array.from({ length: 60 }, (_, i) => makeBook(i + 1)));
    const { client, count, calls } = createTestClient(handlers);
    const user = userEvent.setup();
    const { router } = renderSignedIn({ client });
    await waitFor(() => expect(rows()).toHaveLength(50));
    await io.scrollSentinel();
    await waitFor(() => expect(rows()).toHaveLength(60));

    await deleteFromSheet(user, "Book 058", { withFiles: false });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.location.pathname).toBe("/");
    expect(rows()).toHaveLength(59);
    expect(screen.queryByRole("button", { name: "Book 058" })).not.toBeInTheDocument();
    expect(screen.getByText("59 books")).toBeInTheDocument();
    expect(calls.find((c) => c.name === "DeleteBook").variables).toEqual({ id: "b058", deleteFiles: false });
    expect(count("GetBooks")).toBe(2);
    expect(count("GetBook")).toBe(0);
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(false);
    expect(client.cache.extract()["Book:b058"]).toBeUndefined();
  });
});
