/**
 * "Last read" (`dateFinished`, Chef 2026-10-08) end to end through the real
 * shell and a scripted gateway: the detail page's editor (set + clear), the
 * Edit metadata field, and the move to Read — today filled in the same
 * mutation when empty, asked about when set, and Undo putting back the shelf
 * and the old date.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestClient, libraryServer, makeBook, renderSignedIn, stubFetch, stubIntersectionObserver } from "../appHarness";

vi.setConfig({ testTimeout: 60000 });

// Toasts auto-hide on a real setTimeout, and a loaded runner can take longer
// than that between the toast appearing and the click on its action. Keep
// every toast up (duration 0 = no timer) so the test is about the behaviour.
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

// 9 PM Central on Oct 8 — already Oct 9 in UTC. "Today" must be Oct 8.
const NOW = new Date("2026-10-09T02:00:00.000Z");
const TODAY = "2026-10-08T00:00:00.000Z";
const SET = "2024-03-10T00:00:00.000Z";

let savedTz;
beforeAll(() => { savedTz = process.env.TZ; process.env.TZ = "America/Chicago"; });
afterAll(() => { process.env.TZ = savedTz; });
beforeEach(() => {
  stubIntersectionObserver();
  stubFetch();
  // Only Date: the harness answers on real setTimeouts.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The toast's Snackbar sits outside the open sheet's portal, so MUI's modal
// marks it aria-hidden while the sheet is up: its buttons are queried hidden.
const updates = (calls) => calls.filter((c) => c.name === "UpdateBook").map((c) => c.variables.input);

function open(book) {
  const { handlers, db } = libraryServer([book]);
  const { client, calls } = createTestClient(handlers);
  const user = userEvent.setup();
  renderSignedIn({ client, initialEntries: [`/book/${ book.id }`] });
  return { db, calls, user };
}

async function moveToRead(user) {
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Shelf" }));
  const sheet = await screen.findByRole("dialog", { name: "Shelf" });
  await user.click(within(sheet).getByText("Read"));
}

describe("the detail page's Last read row", () => {
  it("shows 'Set date' when empty, and saves the chosen day as UTC midnight", async () => {
    const { calls, user, db } = open(makeBook(1));
    await user.click(await screen.findByRole("button", { name: "Set last read date" }));
    const field = screen.getByLabelText("Last read date");
    fireEvent.change(field, { target: { value: "2026-10-01" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updates(calls)).toEqual([{ dateFinished: "2026-10-01T00:00:00.000Z" }]));
    expect(db.books[0].dateFinished).toBe("2026-10-01T00:00:00.000Z");
    const shown = new Date(2026, 9, 1).toLocaleDateString();
    expect(await screen.findByRole("button", { name: `Last read ${ shown }. Change date` })).toBeInTheDocument();
  });

  it("Clear sends null and the row goes back to 'Set date'", async () => {
    const { calls, user } = open(makeBook(1, { shelf: "read", dateFinished: SET }));
    await user.click(await screen.findByRole("button", { name: /^Last read .*Change date$/ }));
    expect(screen.getByLabelText("Last read date")).toHaveValue("2024-03-10");
    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(updates(calls)).toEqual([{ dateFinished: null }]));
    expect(await screen.findByRole("button", { name: "Set last read date" })).toBeInTheDocument();
  });
});

describe("Edit metadata's Last read field", () => {
  it("writes the chosen day as UTC midnight, and leaves an untouched date out", async () => {
    const { calls, user } = open(makeBook(1, { dateFinished: SET }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Edit metadata"));
    const field = await screen.findByLabelText("Last read");
    expect(field).toHaveValue("2024-03-10");

    // Untouched: not in the payload at all.
    fireEvent.change(screen.getByRole("textbox", { name: /My tags/ }), { target: { value: "x" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates(calls)).toHaveLength(1));
    expect(updates(calls)[0]).not.toHaveProperty("dateFinished");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit metadata" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Edit metadata"));
    fireEvent.change(await screen.findByLabelText("Last read"), { target: { value: "2026-09-30" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1].dateFinished).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("moving a book to Read", () => {
  it("with no date: today (local) goes in the same mutation, and the toast says so", async () => {
    const { calls, user } = open(makeBook(1, { shelf: "reading" }));
    await moveToRead(user);
    await waitFor(() => expect(updates(calls)).toEqual([{ shelf: "read", dateFinished: TODAY }]));
    expect(await screen.findByText("Moved to Read · Last read set to today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change date", hidden: true })).toBeInTheDocument();
  });

  it("Undo puts back the shelf AND the empty date", async () => {
    const { calls, user, db } = open(makeBook(1, { shelf: "reading" }));
    await moveToRead(user);
    await user.click(await screen.findByRole("button", { name: "Undo", hidden: true }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({ shelf: "reading", dateFinished: null });
    expect(db.books[0]).toMatchObject({ shelf: "reading", dateFinished: null });
  });

  it("Change date opens the Last read editor", async () => {
    const { user } = open(makeBook(1, { shelf: "reading" }));
    await moveToRead(user);
    await user.click(await screen.findByRole("button", { name: "Change date", hidden: true }));
    expect(await screen.findByLabelText("Last read date")).toHaveValue("2026-10-08");
  });

  it("with a date already: moves the shelf only and asks — Set to today, or Undo", async () => {
    const { calls, user, db } = open(makeBook(1, { shelf: "reading", dateFinished: SET }));
    await moveToRead(user);
    await waitFor(() => expect(updates(calls)).toEqual([{ shelf: "read" }]));
    const shown = new Date(2024, 2, 10).toLocaleDateString(undefined, { month: "short", year: "numeric" });
    expect(await screen.findByText(`Moved to Read · Last read ${ shown }`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set to today", hidden: true }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({ dateFinished: TODAY });
    expect(db.books[0].dateFinished).toBe(TODAY);
  });

  it("with a date already: Undo moves the shelf back and leaves the date alone", async () => {
    const { calls, user, db } = open(makeBook(1, { shelf: "reading", dateFinished: SET }));
    await moveToRead(user);
    await user.click(await screen.findByRole("button", { name: "Undo", hidden: true }));
    await waitFor(() => expect(updates(calls)).toHaveLength(2));
    expect(updates(calls)[1]).toEqual({ shelf: "reading" });
    expect(db.books[0]).toMatchObject({ shelf: "reading", dateFinished: SET });
  });
});
