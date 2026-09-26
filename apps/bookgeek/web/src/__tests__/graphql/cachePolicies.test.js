import { describe, expect, it } from "vitest";
import { InMemoryCache } from "@apollo/client";
import {
  BOOK_TYPE_POLICIES,
  applyShelfChangeToLists,
  listArgs,
  listShelves,
  matchesShelfFilter,
  removeBookFromLists,
  restBookToEntity,
  writeRestBook,
} from "../../graphql/cachePolicies";
import { BOOK_FIELDS, GET_BOOKS } from "../../graphql/queries";
import { makeBook } from "../appHarness";

describe("matchesShelfFilter — the gateway's shelfMatch()", () => {
  it("is an exact match for every shelf but unread", () => {
    expect(matchesShelfFilter({ shelf: "read" }, "read")).toBe(true);
    expect(matchesShelfFilter({ shelf: "reading" }, "read")).toBe(false);
    expect(matchesShelfFilter({ shelf: "custom-x" }, "custom-x")).toBe(true);
    expect(matchesShelfFilter({ shelf: "anything" }, "all")).toBe(true);
  });

  it("unread is shelf unread/empty AND not finished", () => {
    expect(matchesShelfFilter({ shelf: "" }, "unread")).toBe(true);
    expect(matchesShelfFilter({ shelf: null }, "unread")).toBe(true);
    expect(matchesShelfFilter({ shelf: "unread" }, "unread")).toBe(true);
    expect(matchesShelfFilter({ shelf: "", readCount: 1 }, "unread")).toBe(false);
    expect(matchesShelfFilter({ shelf: "", dateFinished: "2026-01-01" }, "unread")).toBe(false);
    expect(matchesShelfFilter({ shelf: "reading" }, "unread")).toBe(false);
  });
});

function seededCache() {
  const cache = new InMemoryCache();
  cache.policies.addTypePolicies(BOOK_TYPE_POLICIES);
  const write = (variables, books) =>
    cache.writeQuery({
      query: GET_BOOKS,
      variables: { ...variables, page: 1, limit: 50 },
      data: { books: { __typename: "BookPage", items: books, total: books.length, page: 1, pageSize: 50 } },
    });
  const read = (variables) =>
    cache.readQuery({ query: GET_BOOKS, variables: { ...variables, page: 1, limit: 50 } })?.books;
  return { cache, write, read };
}

describe("Query.books — @geeksuite/collection's paged list, keyed by filter + sort", () => {
  const page = (books, n, total) => ({ __typename: "BookPage", items: books, total, page: n, pageSize: 2 });

  it("every page of one filter lands in one list; another filter is another list", () => {
    const { cache } = seededCache();
    const vars = (p, filter) => ({ page: p, limit: 2, sort: "title", sortDir: "asc", ...(filter ? { filter } : {}) });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(1), data: { books: page([makeBook(1), makeBook(2)], 1, 4) } });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(2), data: { books: page([makeBook(3), makeBook(4)], 2, 4) } });
    cache.writeQuery({
      query: GET_BOOKS,
      variables: vars(1, { shelves: ["read"] }),
      data: { books: page([makeBook(9)], 1, 1) },
    });
    const all = cache.readQuery({ query: GET_BOOKS, variables: vars(1) }).books;
    expect(all.items.map((b) => b.id)).toEqual(["b001", "b002", "b003", "b004"]);
    const read = cache.readQuery({ query: GET_BOOKS, variables: vars(1, { shelves: ["read"] }) }).books;
    expect(read.items.map((b) => b.id)).toEqual(["b009"]);
  });

  it("a page-1 refresh keeps every row loaded past it (no collapse)", () => {
    const { cache } = seededCache();
    const vars = (p) => ({ page: p, limit: 2, sort: "title", sortDir: "asc" });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(1), data: { books: page([makeBook(1), makeBook(2)], 1, 4) } });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(2), data: { books: page([makeBook(3), makeBook(4)], 2, 4) } });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(1), data: { books: page([makeBook(1), makeBook(2)], 1, 4) } });
    expect(cache.readQuery({ query: GET_BOOKS, variables: vars(1) }).books.items).toHaveLength(4);
  });

  it("a shuffle's seed is part of the key: a new seed is a new order, not a merge into the old one", () => {
    const { cache } = seededCache();
    const vars = (seed) => ({ page: 1, limit: 2, sort: "random", sortDir: "asc", seed });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(7), data: { books: page([makeBook(2), makeBook(1)], 1, 2) } });
    cache.writeQuery({ query: GET_BOOKS, variables: vars(8), data: { books: page([makeBook(1), makeBook(2)], 1, 2) } });
    expect(cache.readQuery({ query: GET_BOOKS, variables: vars(7) }).books.items.map((b) => b.id)).toEqual(["b002", "b001"]);
  });
});

describe("cache helpers", () => {
  it("listShelves reads a list's shelves from filter.shelves or the flat shelf arg", () => {
    expect(listShelves({ filter: { shelves: ["read", "abandoned"] } })).toEqual(["read", "abandoned"]);
    expect(listShelves({ shelf: "reading" })).toEqual(["reading"]);
    expect(listShelves({ shelf: "all" })).toEqual([]);
    expect(listShelves({})).toEqual([]);
  });

  it("listArgs reads a stored list's key args", () => {
    expect(listArgs('books:{"shelf":"reading","sort":"title"}')).toEqual({ shelf: "reading", sort: "title" });
    expect(listArgs("books")).toEqual({});
  });

  it("removeBookFromLists takes the book out of every list, fixes totals, and drops the entity", () => {
    const { cache, write, read } = seededCache();
    write({ sort: "title" }, [makeBook(1), makeBook(2)]);
    write({ sort: "title", shelf: "reading" }, [makeBook(2)]);
    removeBookFromLists(cache, "b002");
    expect(read({ sort: "title" }).items.map((b) => b.id)).toEqual(["b001"]);
    expect(read({ sort: "title" }).total).toBe(1);
    expect(read({ sort: "title", shelf: "reading" }).items).toEqual([]);
    expect(cache.extract()["Book:b002"]).toBeUndefined();
  });

  it("applyShelfChangeToLists leaves only the lists the new shelf no longer matches", () => {
    const { cache, write, read } = seededCache();
    write({ sort: "title" }, [makeBook(1), makeBook(2)]);
    write({ sort: "title", shelf: "reading" }, [makeBook(1), makeBook(2)]);
    applyShelfChangeToLists(cache, { ...makeBook(2), shelf: "read" });
    expect(read({ sort: "title" }).items).toHaveLength(2);
    expect(read({ sort: "title", shelf: "reading" }).items.map((b) => b.id)).toEqual(["b001"]);
    expect(read({ sort: "title", shelf: "reading" }).total).toBe(1);
  });

  it("applyShelfChangeToLists reads the faceted lists' filter.shelves too", () => {
    const { cache, write, read } = seededCache();
    write({ sort: "title", filter: { shelves: ["reading"] } }, [makeBook(1), makeBook(2)]);
    write({ sort: "title", filter: { shelves: ["reading", "read"] } }, [makeBook(1), makeBook(2)]);
    applyShelfChangeToLists(cache, { ...makeBook(2), shelf: "read" });
    expect(read({ sort: "title", filter: { shelves: ["reading"] } }).items.map((b) => b.id)).toEqual(["b001"]);
    // Still on one of that list's shelves: it stays.
    expect(read({ sort: "title", filter: { shelves: ["reading", "read"] } }).items).toHaveLength(2);
  });

  it("writeRestBook writes a Mongo-shaped REST book over Book:<id>", () => {
    const { cache, write, read } = seededCache();
    write({ sort: "title" }, [makeBook(1)]);
    const { __typename: _t, id: _id, ...rest } = makeBook(1, { title: "From REST", coverPath: "covers/x.jpg" });
    expect(writeRestBook(cache, { _id: "b001", ...rest, files: [{ format: "epub", path: "x.epub" }] })).toBe("b001");
    const row = read({ sort: "title" }).items[0];
    expect(row.title).toBe("From REST");
    expect(row.coverPath).toBe("covers/x.jpg");
    expect(row.files[0]).toMatchObject({ format: "epub", path: "x.epub", size: null });
    expect(cache.readFragment({ id: "Book:b001", fragment: BOOK_FIELDS, fragmentName: "BookFields" })).not.toBeNull();
  });

  it("restBookToEntity refuses a book with no id", () => {
    expect(restBookToEntity({ title: "x" })).toBeNull();
    expect(restBookToEntity(null)).toBeNull();
  });
});
