/**
 * Type policies for BookGeek's slice of the shared Apollo cache — the book
 * list lives here now, not in a hand-managed `setBooks` array.
 *
 * `GeekSuiteApolloProvider` builds a plain InMemoryCache the app cannot
 * configure up front, so these are added at runtime with
 * `cache.policies.addTypePolicies` — before the first query writes anything
 * (App.jsx). The shape follows GameGeek's `graphql/cachePolicies.js`:
 *
 *   - `Query.books` is ONE list per filter + sort (keyArgs leave out `page`
 *     and `limit`); page 1 refreshes its head, later pages append
 *     (`mergeBooksPage`). Edits never refetch it: every Book-returning
 *     mutation updates `Book:<id>` in place, and REST replies (enrich,
 *     covers, file upload) are written with `writeRestBook`. A create
 *     refreshes page 1 IN PLACE with one `client.query` (`refreshLibraryHead`).
 *     `refetch()` would not do: Apollo writes a refetch with `overwrite`, so
 *     the merge sees no existing list and three loaded pages collapse to one —
 *     GameGeek's scroll-to-top bug of 2026-09-25.
 *   - `Query.book` reads through to a `Book:<id>` the library already holds,
 *     so a card tap shows the sheet instantly; a deep link fetches.
 *   - A shelf move takes the book out of any cached list whose shelf filter it
 *     no longer matches (`applyShelfChangeToLists`). That replaces the old
 *     "reload page 1 after every shelf move", which collapsed the list.
 */
import { BOOK_FIELDS, GET_BOOKS } from "./queries.js";

const keyOf = (ref) => ref?.__ref ?? ref?.id;

/**
 * Merge one incoming `BookPage` into the cached list for its filter + sort.
 *
 *   - page 1 is a refresh: its rows replace the head of the list. Rows already
 *     loaded beyond it stay — everything after the last row the fresh head
 *     shares with the old list — so a create, a delete elsewhere, or a
 *     revisit of a filter never collapses what is loaded. With no overlap at
 *     all the list changed wholesale and the fresh head stands alone.
 *   - a later page appends the rows the list does not have yet.
 * Either way a book is in the list once.
 */
export function mergeBooksPage(existing, incoming, { args } = {}) {
  if (!incoming) return existing;
  const old = existing?.items ?? [];
  const fresh = incoming.items ?? [];
  const page = args?.page ?? 1;
  let ordered;
  if (page <= 1) {
    const freshKeys = new Set(fresh.map(keyOf));
    let lastShared = -1;
    old.forEach((ref, i) => {
      if (freshKeys.has(keyOf(ref))) lastShared = i;
    });
    ordered = lastShared === -1 ? fresh : [...fresh, ...old.slice(lastShared + 1)];
  } else {
    ordered = [...old, ...fresh];
  }
  const seen = new Set();
  const items = ordered.filter((ref) => {
    const key = keyOf(ref);
    if (!ref || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...incoming, items };
}

export const BOOK_TYPE_POLICIES = {
  Query: {
    fields: {
      books: {
        keyArgs: ["q", "author", "tag", "shelf", "owned", "sort", "sortDir"],
        merge: mergeBooksPage,
      },
      book: {
        read(existing, { args, toReference }) {
          return existing ?? (args?.id ? toReference({ __typename: "Book", id: args.id }) : undefined);
        },
      },
    },
  },
};

const installed = new WeakSet();

export function installBookPolicies(client) {
  const cache = client?.cache;
  if (!cache?.policies || installed.has(cache)) return;
  cache.policies.addTypePolicies(BOOK_TYPE_POLICIES);
  installed.add(cache);
}

/** The key args a cached `books` list was stored under (`books:{"shelf":…}`). */
export function listArgs(storeFieldName) {
  const at = storeFieldName.indexOf(":");
  if (at === -1) return {};
  try {
    return JSON.parse(storeFieldName.slice(at + 1)) || {};
  } catch {
    return {};
  }
}

/**
 * Does a book belong on a shelf filter? The gateway's `shelfMatch()`
 * (apps/basegeek/packages/api/src/graphql/bookgeek/resolvers.js), exactly:
 * `unread` is "shelf unread or empty, and not finished"; every other shelf is
 * an exact match. Keep the two in step.
 */
export function matchesShelfFilter(book, shelf) {
  if (!shelf || shelf === "all") return true;
  const current = book?.shelf ?? "";
  if (shelf !== "unread") return current === shelf;
  const onUnread = current === "unread" || current === "" || current == null;
  const finished =
    current === "read" ||
    current === "abandoned" ||
    (Number(book?.readCount) || 0) > 0 ||
    (book?.dateFinished != null && book.dateFinished !== "");
  return onUnread && !finished;
}

/**
 * Take one book out of every cached list (and its total) — a delete, with no
 * refetch — and drop the `Book:<id>` entity so the detail route reads nothing.
 */
export function removeBookFromLists(cache, bookId) {
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      books(existing, { readField }) {
        if (!existing?.items) return existing;
        const items = existing.items.filter((ref) => (readField("id", ref) ?? ref?.id) !== bookId);
        if (items.length === existing.items.length) return existing;
        return { ...existing, items, total: Math.max(0, (existing.total ?? 1) - 1) };
      },
    },
  });
  cache.evict({ id: cache.identify({ __typename: "Book", id: bookId }) });
  cache.gc();
}

/**
 * After a shelf move: the row itself is already updated in place (the
 * mutation returned `Book:<id>`); this removes it from each cached list whose
 * shelf filter it no longer matches, so "Reading → Read" leaves the Reading
 * list without reloading it.
 */
export function applyShelfChangeToLists(cache, book) {
  const bookId = book?.id;
  if (!bookId) return;
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      books(existing, { readField, storeFieldName }) {
        if (!existing?.items) return existing;
        const { shelf } = listArgs(storeFieldName);
        if (!shelf || shelf === "all" || matchesShelfFilter(book, shelf)) return existing;
        const items = existing.items.filter((ref) => (readField("id", ref) ?? ref?.id) !== bookId);
        if (items.length === existing.items.length) return existing;
        return { ...existing, items, total: Math.max(0, (existing.total ?? 1) - 1) };
      },
    },
  });
}

const BOOK_SCALARS = [
  "title", "authors", "isbn", "isbn13", "goodreadsId", "openLibraryId", "asin",
  "googleBooksId", "publisher", "publishedDate", "pageCount", "description",
  "language", "tags", "coverPath", "owned", "shelf", "rating", "review",
  "dateAdded", "dateStarted", "dateFinished", "readCount", "readingProgress",
  "source", "createdAt", "updatedAt",
];

/** A REST (Mongo) book as a complete `Book` the cache can hold. */
export function restBookToEntity(raw) {
  if (!raw) return null;
  const id = raw.id ?? raw._id;
  if (!id) return null;
  const entity = { __typename: "Book", id: String(id) };
  for (const key of BOOK_SCALARS) entity[key] = raw[key] ?? null;
  entity.series = raw.series
    ? { __typename: "BookSeries", name: raw.series.name ?? null, index: raw.series.index ?? null }
    : null;
  entity.files = Array.isArray(raw.files)
    ? raw.files.map((f) => ({
      __typename: "BookFile",
      format: f?.format ?? null,
      path: f?.path ?? null,
      size: f?.size ?? null,
      addedAt: f?.addedAt ?? null,
    }))
    : null;
  return entity;
}

/**
 * Write a book that came back from bookgeek's own REST API (enrich, covers,
 * file upload, merge) over `Book:<id>`, so every list row and the open sheet
 * show it — the cache's version of the old `setBooks(prev.map(…))`.
 * Returns the id written, or null.
 */
export function writeRestBook(cache, raw) {
  const entity = restBookToEntity(raw);
  if (!entity) return null;
  cache.writeFragment({
    id: cache.identify(entity),
    fragment: BOOK_FIELDS,
    fragmentName: "BookFields",
    data: entity,
  });
  return entity.id;
}

/** Patch a few fields of `Book:<id>` in place (the optimistic rating). */
export function patchBook(cache, bookId, patch) {
  const id = cache.identify({ __typename: "Book", id: bookId });
  const fields = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (key === "__typename" || key === "id" || key === "_id") continue;
    fields[key] = () => value;
  }
  cache.modify({ id, fields });
}

/**
 * Refresh page 1 of the current list IN PLACE (after a create): one request,
 * written through `mergeBooksPage`, so what is loaded stays loaded.
 */
export function refreshLibraryHead(client, variables) {
  return client.query({ query: GET_BOOKS, variables: { ...variables, page: 1 }, fetchPolicy: "network-only" });
}
