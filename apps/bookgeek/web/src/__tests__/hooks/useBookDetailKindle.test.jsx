/**
 * Code review 2026-11-19 #3: an email cannot be unsent, and the confirm's
 * Send stayed tappable while its dialog faded out, so a double tap sent the
 * book twice. One send at a time, whatever the taps do.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApolloProvider } from "@apollo/client";
import { MemoryRouter } from "react-router-dom";
import { createTestClient, libraryServer, makeBook, stubFetch } from "../appHarness";
import { GET_BOOK } from "../../graphql/queries.js";
import { authFetch } from "../../utils/authFetch";
import { useBookDetail } from "../../hooks/useBookDetail";

vi.mock("../../utils/authFetch", async (orig) => ({ ...(await orig()), authFetch: vi.fn() }));

beforeEach(() => { stubFetch(); });
afterEach(() => {
  vi.unstubAllGlobals();
  authFetch.mockReset();
});

function mount() {
  const book = makeBook(1);
  const { handlers } = libraryServer([book]);
  const { client } = createTestClient(handlers);
  client.writeQuery({ query: GET_BOOK, variables: { id: book.id }, data: { book } });
  const wrapper = ({ children }) => (
    <ApolloProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </ApolloProvider>
  );
  return { ...renderHook(() => useBookDetail({ bookId: book.id, onClose: () => {}, onDeleted: () => {} }), { wrapper }), book };
}

describe("useBookDetail — Send to Kindle", () => {
  it("a second send while the first is in flight does nothing; after it lands a new one goes", async () => {
    let finish;
    authFetch.mockImplementation(
      () => new Promise((resolve) => {
        finish = () => resolve({ ok: true, json: async () => ({ success: true, data: { kindleEmail: "x" } }) });
      })
    );
    const { result, book } = mount();
    await waitFor(() => expect(result.current.selectedBook?.id).toBe(book.id));

    act(() => {
      result.current.handleSendToKindle(book);
      result.current.handleSendToKindle(book);
    });
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(result.current.sendToKindleLoading).toBe(true);

    await act(async () => { finish(); });
    await waitFor(() => expect(result.current.sendToKindleLoading).toBe(false));

    act(() => { result.current.handleSendToKindle(book); });
    expect(authFetch).toHaveBeenCalledTimes(2);
    await act(async () => { finish(); });
  });
});
