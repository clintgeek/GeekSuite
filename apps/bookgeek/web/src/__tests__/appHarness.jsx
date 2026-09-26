/**
 * Mount the signed-in app (shell + routes) against a scripted gateway.
 *
 * The Apollo client is real — a real InMemoryCache with BookGeek's policies
 * (graphql/cachePolicies.js) — and only the link is fake: each operation is
 * answered by `handlers[operationName](variables)` and logged in `calls`, so a
 * test can say "GetBooks ran exactly three times" and mean it. `fetch` (the
 * bookgeek REST API: `/api/health`, `DELETE /api/books/:id`, …) is stubbed the
 * same way, and IntersectionObserver is captured so a test can scroll the
 * load-more sentinel into view.
 */
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from "@apollo/client";
import { vi } from "vitest";
import { SignedIn } from "../App";
import { installBookPolicies } from "../graphql/cachePolicies";
import { createBookTheme } from "../theme/theme";

export const PAGE = 50;

export function makeBook(i, over = {}) {
  const id = `b${ String(i).padStart(3, "0") }`;
  return {
    __typename: "Book",
    id,
    title: `Book ${ String(i).padStart(3, "0") }`,
    authors: ["Some Author"],
    series: null,
    isbn: null,
    isbn13: null,
    goodreadsId: null,
    openLibraryId: null,
    asin: null,
    googleBooksId: null,
    publisher: null,
    publishedDate: null,
    pageCount: 300,
    description: null,
    language: "en",
    tags: [],
    files: [{ __typename: "BookFile", format: "epub", path: `a/${ id }.epub`, size: 1000, addedAt: null }],
    coverPath: null,
    owned: true,
    shelf: "reading",
    rating: null,
    review: null,
    dateAdded: null,
    dateStarted: null,
    dateFinished: null,
    readCount: 0,
    readingProgress: 0,
    source: "manual",
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

/**
 * A server-side library: pages of `books`, filtered by shelf (the flat `shelf`
 * arg or `filter.shelves`) and `filter.q` like the gateway, with facet counts
 * for the panel (shelves only — enough for the counts to be real).
 */
export function libraryServer(books) {
  const db = { books: [...books] };
  const matches = (b, v = {}, { except } = {}) => {
    const f = v.filter || {};
    const shelves = f.shelves?.length ? f.shelves : v.shelf ? [v.shelf] : [];
    if (except !== "shelves" && shelves.length && !shelves.includes(b.shelf)) return false;
    if (f.q && !b.title.toLowerCase().includes(String(f.q).toLowerCase())) return false;
    return true;
  };
  const handlers = {
    GetBookFacets: (v) => {
      const counts = new Map();
      db.books.filter((b) => matches(b, v, { except: "shelves" })).forEach((b) => counts.set(b.shelf, (counts.get(b.shelf) || 0) + 1));
      const none = [];
      return {
        bookFacets: {
          __typename: "BookFacets",
          total: db.books.filter((b) => matches(b, v)).length,
          shelves: [...counts].map(([value, count]) => ({ __typename: "BookFacetValue", value, count })),
          authors: none,
          series: none,
          tags: none,
          formats: none,
          languages: none,
          readYears: none,
          ratings: none,
          owned: 0,
          hasFile: 0,
        },
      };
    },
    GetBooks: (v) => {
      const rows = db.books.filter((b) => matches(b, v));
      const page = v.page || 1;
      const limit = v.limit || PAGE;
      return {
        books: {
          __typename: "BookPage",
          items: rows.slice((page - 1) * limit, page * limit),
          total: rows.length,
          page,
          pageSize: limit,
        },
      };
    },
    GetBook: (v) => ({ book: db.books.find((b) => b.id === v.id) ?? null }),
    GetShelves: () => ({
      shelves: { __typename: "ShelfStats", total: db.books.length, owned: 0, unowned: 0, shelves: [] },
    }),
    GetBookProfile: () => ({
      bookProfile: { __typename: "BookProfile", userId: "u1", kindleEmail: null, deviceWord: null, customShelves: [], savedFilters: [] },
    }),
    GetLibraryFilters: () => ({ libraryFilters: [] }),
    UpdateBook: (v) => {
      const i = db.books.findIndex((b) => b.id === v.id);
      db.books[i] = { ...db.books[i], ...v.input };
      return { updateBook: db.books[i] };
    },
    DeleteBook: (v) => {
      db.books = db.books.filter((b) => b.id !== v.id);
      return { deleteBook: { __typename: "DeleteBookResponse", success: true, deletedId: v.id } };
    },
  };
  return { db, handlers };
}

export function createTestClient(handlers) {
  const calls = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        const name = operation.operationName;
        calls.push({ name, variables: operation.variables });
        const handler = handlers[name];
        // A macrotask, like a network reply: answered in microtasks, React
        // batches a load's `loadingMore` true→false into one render, and the
        // infinite-scroll sentinel (released when that flag drops) never
        // sees it drop.
        new Promise((resolve) => setTimeout(resolve, 0))
          .then(() => {
            if (!handler) throw new Error(`unstubbed operation ${ name }`);
            return handler(operation.variables);
          })
          .then((data) => {
            observer.next({ data });
            observer.complete();
          })
          .catch((err) => observer.error(err));
      })
  );
  const client = new ApolloClient({ link, cache: new InMemoryCache() });
  installBookPolicies(client);
  const count = (name) => calls.filter((c) => c.name === name).length;
  return { client, calls, count };
}

/** Captured IntersectionObservers: `scrollSentinel()` fires the live ones. */
export function stubIntersectionObserver() {
  const live = new Set();
  class IO {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      live.add(this);
    }
    observe(t) {
      this.targets.push(t);
    }
    unobserve() {}
    disconnect() {
      live.delete(this);
    }
  }
  vi.stubGlobal("IntersectionObserver", IO);
  return {
    // The sentinel (@geeksuite/collection useInfiniteSentinel) disconnects
    // while a page loads and observes afresh once it lands — a real observer
    // then reports at once. So wait for a live one before "scrolling" to it.
    async scrollSentinel() {
      await waitFor(() => {
        if (![...live].some((io) => io.targets.length)) throw new Error("no live sentinel yet");
      });
      await act(async () => {
        for (const io of [...live]) {
          if (io.targets.length) io.cb([{ isIntersecting: true, target: io.targets[0] }]);
        }
      });
    },
  };
}

/** `fetch` for bookgeek's REST API: health is up; everything else via `rest`. */
export function stubFetch(rest = () => null) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const u = String(url);
    if (u.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok", db: { state: 1 } }), { status: 200 });
    }
    const answer = await rest(u, options);
    if (answer) return answer;
    return new Response(JSON.stringify({ error: "not stubbed" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Records the router location, and hands out `navigate` (for the Back button). */
export function RouterProbe({ into }) {
  into.location = useLocation();
  into.navigate = useNavigate();
  return null;
}

const theme = createBookTheme("dark");

export function renderSignedIn({ client, initialEntries = ["/"] }) {
  const router = {};
  const utils = render(
    <ThemeProvider theme={theme}>
      <ApolloProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <RouterProbe into={router} />
          <SignedIn user={{ id: "u1", username: "chef" }} onSignOut={() => {}} />
        </MemoryRouter>
      </ApolloProvider>
    </ThemeProvider>
  );
  return { ...utils, router };
}
