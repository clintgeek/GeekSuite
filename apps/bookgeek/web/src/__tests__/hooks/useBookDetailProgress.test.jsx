/**
 * SUITE_REVIEW_2026-11 BookGeek #2: a reading-progress save waits 400 ms
 * (the slider's debounce). Before the fix, the effect that kept the field in
 * step with the book ran on EVERY cache write to it (a star tap) and on
 * unmount (Back), and its cleanup cleared the timer — the save was dropped
 * with no error, and the old number came back.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApolloProvider } from "@apollo/client";
import { MemoryRouter } from "react-router-dom";
import { createTestClient, libraryServer, makeBook, stubFetch } from "../appHarness";
import { GET_BOOK } from "../../graphql/queries.js";
import { useBookDetail } from "../../hooks/useBookDetail";

beforeEach(() => { stubFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

function mount() {
  const book = makeBook(1, { readingProgress: 10 });
  const { handlers } = libraryServer([book]);
  const { client, calls } = createTestClient(handlers);
  client.writeQuery({ query: GET_BOOK, variables: { id: book.id }, data: { book } });
  const wrapper = ({ children }) => (
    <ApolloProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </ApolloProvider>
  );
  const hook = renderHook(() => useBookDetail({ bookId: book.id, onClose: () => {}, onDeleted: () => {} }), { wrapper });
  const progressWrites = () => calls.filter((c) => c.name === "UpdateBook" && "readingProgress" in c.variables.input)
    .map((c) => c.variables.input.readingProgress);
  return { ...hook, client, book, progressWrites };
}

describe("useBookDetail — a pending progress save is flushed, never dropped", () => {
  it("an unrelated cache write to the book (a star tap) neither cancels the save nor resets the field", async () => {
    const { result, client, book, progressWrites } = mount();
    await waitFor(() => expect(result.current.selectedBook?.id).toBe(book.id));

    act(() => {
      result.current.setProgressDraft(42);
      result.current.scheduleProgressCommit(result.current.selectedBook, 42);
    });
    // Another field of the same book changes in the cache inside the debounce.
    act(() => {
      client.cache.modify({ id: client.cache.identify(book), fields: { rating: () => 4 } });
    });
    expect(result.current.progressDraft).toBe(42);

    await waitFor(() => expect(progressWrites()).toEqual([42]));
  });

  it("closing the sheet inside the debounce still saves the number", async () => {
    const { result, unmount, book, progressWrites } = mount();
    await waitFor(() => expect(result.current.selectedBook?.id).toBe(book.id));

    act(() => {
      result.current.setProgressDraft(57);
      result.current.scheduleProgressCommit(result.current.selectedBook, 57);
    });
    unmount();

    await waitFor(() => expect(progressWrites()).toEqual([57]));
  });
});
