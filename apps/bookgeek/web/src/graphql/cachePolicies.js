/**
 * Type policies for BookGeek's slice of the shared Apollo cache — the book
 * list lives here, not in a hand-managed `setBooks` array. The paginated-list
 * machinery is `@geeksuite/collection`'s (cache/pagedList.js), the same one
 * GameGeek runs on:
 *
 *   - `Query.books` is ONE list per filter + sort (keyArgs leave out `page`
 *     and `limit`); page 1 refreshes its head, later pages append
 *     (`pagedListPolicy`). Edits never refetch it: every Book-returning
 *     mutation updates `Book:<id>` in place, and REST replies (enrich,
 *     covers, file upload) are written with `writeRestBook`. A create
 *     refreshes the list IN PLACE (`refreshLibraryList`, one request as long
 *     as what is loaded). `refetch()` would not do: Apollo writes a refetch
 *     with `overwrite`, so three loaded pages collapse to one — GameGeek's
 *     scroll-to-top bug of 2026-09-25.
 *   - `Query.book` reads through to a `Book:<id>` the library already holds,
 *     so a card tap shows the sheet instantly; a deep link fetches.
 *   - A shelf move takes the book out of any cached list whose shelf filter
 *     it no longer matches (`applyShelfChangeToLists`), instead of reloading.
 *
 * `GeekSuiteApolloProvider` builds a plain InMemoryCache the app cannot
 * configure up front, so these are added at runtime — before the first query
 * writes anything (App.jsx).
 */
import { installTypePoliciesOnce, pagedListPolicy, refreshPagedList, removeFromPagedLists } from "@geeksuite/collection";
import { BOOK_FIELDS, GET_BOOKS } from "./queries.js";
import { PAGE_SIZE, booksVariablesFor } from "../utils/libraryFilter.js";

export const BOOK_TYPE_POLICIES = {
  Query: {
    fields: {
      // `filter` + `seed` are the faceted library's; the flat args are kept
      // so a list asked for the old way (the CSV export walks `no-cache`, but
      // anything else) still gets its own list.
      books: pagedListPolicy({
        keyArgs: ["q", "author", "tag", "shelf", "owned", "filter", "sort", "sortDir", "seed"],
        itemsField: "items",
      }),
      book: {
        read(existing, { args, toReference }) {
          return existing ?? (args?.id ? toReference({ __typename: "Book", id: args.id }) : undefined);
        },
      },
    },
  },
};

export function installBookPolicies(client) {
  installTypePoliciesOnce(client, BOOK_TYPE_POLICIES);
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
  removeFromPagedLists(cache, { field: "books", itemsField: "items", typename: "Book", id: bookId });
}

/** The shelves a cached list is filtered to: `filter.shelves`, or the flat `shelf` arg. [] = any. */
export function listShelves(args = {}) {
  if (Array.isArray(args.filter?.shelves) && args.filter.shelves.length) return args.filter.shelves;
  return args.shelf && args.shelf !== "all" ? [args.shelf] : [];
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
        const shelves = listShelves(listArgs(storeFieldName));
        if (!shelves.length || shelves.some((shelf) => matchesShelfFilter(book, shelf))) return existing;
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
 * Bring the list a query string shows up to date IN PLACE (after a create):
 * one request as long as what is loaded, merged over the cached list, so the
 * reader keeps every row and their scroll position and the new book shows up
 * where it sorts.
 */
export function refreshLibraryList(client, search = "") {
  return refreshPagedList(client, {
    query: GET_BOOKS,
    variables: booksVariablesFor(search, 1),
    field: "books",
    itemsField: "items",
    pageSize: PAGE_SIZE,
  });
}
