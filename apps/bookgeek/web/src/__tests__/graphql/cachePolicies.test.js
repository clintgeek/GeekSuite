import { describe, expect, it } from "vitest";
import { InMemoryCache } from "@apollo/client";
import {
  BOOK_TYPE_POLICIES,
  applyShelfChangeToLists,
  listArgs,
  matchesShelfFilter,
  mergeBooksPage,
  removeBookFromLists,
  restBookToEntity,
  writeRestBook,
} from "../../graphql/cachePolicies";
import { BOOK_FIELDS, GET_BOOKS } from "../../graphql/queries";
import { makeBook } from "../appHarness";

const refs = (...ids) => ids.map((id) => ({ __ref: `Book:${ id }` }));
const ids = (page) => page.items.map((r) => r.__ref.slice(5));

describe("mergeBooksPage", () => {
  it("appends a later page, once per book", () => {
    const merged = mergeBooksPage({ items: refs("a", "b") }, { items: refs("b", "c"), total: 3 }, { args: { page: 2 } });
    expect(ids(merged)).toEqual(["a", "b", "c"]);
    expect(merged.total).toBe(3);
  });

  it("page 1 refreshes the head and keeps every row loaded past it (no collapse)", () => {
    const existing = { items: refs("a", "b", "c", "d", "e", "f") };
    const merged = mergeBooksPage(existing, { items: refs("a", "b") }, { args: { page: 1 } });
    expect(ids(merged)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("a create in the head does not drop the row it pushed down", () => {
    const existing = { items: refs("a", "b", "c", "d") }; // page size 2
    const merged = mergeBooksPage(existing, { items: refs("new", "a") }, { args: { page: 1 } });
    expect(ids(merged)).toEqual(["new", "a", "b", "c", "d"]);
  });

  it("a book gone from the fresh head is gone from the list", () => {
    const existing = { items: refs("a", "b", "c", "d") };
    const merged = mergeBooksPage(existing, { items: refs("a", "c") }, { args: { page: 1 } });
    expect(ids(merged)).toEqual(["a", "c", "d"]);
  });

  it("a head that shares nothing with the old list replaces it", () => {
    const merged = mergeBooksPage({ items: refs("a", "b") }, { items: refs("x", "y") }, { args: { page: 1 } });
    expect(ids(merged)).toEqual(["x", "y"]);
  });
});

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

describe("cache helpers", () => {
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
