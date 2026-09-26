import { describe, expect, it } from "vitest";
import { booksVariables, hasShelfParam, readLibraryParams, writeLibraryParams } from "../../utils/libraryParams";
import { bookPath, libraryPath, viewForPath } from "../../components/navConfig";

describe("library URL params", () => {
  it("the bare URL is the whole library, sorted by title", () => {
    expect(readLibraryParams("")).toEqual({
      searchQuery: "",
      shelfFilter: "all",
      authorFilter: "",
      tagFilter: "",
      sortBy: "title",
      sortDir: "asc",
    });
  });

  it("round-trips every filter, and leaves defaults out", () => {
    const search = writeLibraryParams("", {
      searchQuery: "dune",
      shelfFilter: "read",
      authorFilter: "Herbert",
      tagFilter: "sf",
      sortBy: "rating",
      sortDir: "desc",
    });
    expect(readLibraryParams(search)).toMatchObject({ searchQuery: "dune", shelfFilter: "read", sortBy: "rating", sortDir: "desc" });
    expect(writeLibraryParams(search, { shelfFilter: "all", sortBy: "title", sortDir: "asc", searchQuery: "" })).toBe("?author=Herbert&tag=sf");
  });

  it("knows when a link names a shelf (the saved default must not override it)", () => {
    expect(hasShelfParam("?shelf=read")).toBe(true);
    expect(hasShelfParam("?q=x")).toBe(false);
  });

  it("builds the gateway variables the old loadBooksPage sent", () => {
    expect(booksVariables(readLibraryParams("?q=%20dune%20&shelf=read"))).toEqual({
      limit: 50,
      sort: "title",
      sortDir: "asc",
      q: "dune",
      shelf: "read",
    });
  });
});

describe("routes", () => {
  it("maps paths onto the two views the components know", () => {
    expect(viewForPath("/")).toBe("library");
    expect(viewForPath("/book/b1")).toBe("library");
    expect(viewForPath("/settings")).toBe("profile");
  });

  it("keeps the library's query string on the way in and out of a book", () => {
    expect(bookPath("b 1", "?shelf=read")).toBe("/book/b%201?shelf=read");
    expect(libraryPath("?shelf=read")).toBe("/?shelf=read");
  });
});
