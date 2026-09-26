/**
 * utils/libraryFilter.js — BookGeek's schema for `@geeksuite/collection`'s
 * URL codec, its GetBooks variables, and how a saved view opens.
 *
 * The legacy round trip is the one that matters to Chef: every saved filter
 * made before Phase C2 has only `searchQuery/authorFilter/tagFilter/
 * shelfFilter/sortBy/sortDir` (and an `ownedFilter` the old library stored
 * but never applied). Opened now, it must ask the gateway for the same list
 * the old "apply" did. The gateway half of that proof — `books(filter: <this
 * filter>)` returns exactly what `books(q, author, tag, shelf)` did — is
 * apps/basegeek/packages/api/src/__tests__/bookgeekFilters.test.js, on the
 * same view (LEGACY_VIEW there).
 */
import { describe, expect, it } from "vitest";
import {
  LIBRARY_CODEC,
  SORT_ORDER,
  buildBooksVariables,
  canonicalSearch,
  hasShelfParam,
  legacyFieldsFor,
  readLibraryState,
  savedViewSearch,
} from "../../utils/libraryFilter";

const stateOf = (search) => readLibraryState(new URLSearchParams(search));
const varsOf = (search) => buildBooksVariables(stateOf(search), 1);

// The same pre-C2 view the gateway test replays.
const LEGACY_VIEW = {
  id: "f2",
  name: "Unread sci-fi",
  sortBy: "dateAdded",
  sortDir: "desc",
  searchQuery: "robot",
  authorFilter: "Asimov",
  tagFilter: "science fiction",
  shelfFilter: "unread",
  ownedOnly: true,
  ownedFilter: "owned",
  filter: null,
};

describe("the URL codec", () => {
  it("the bare / is the whole library, title A→Z", () => {
    expect(varsOf("")).toEqual({ page: 1, limit: 50, sort: "title", sortDir: "asc" });
  });

  it("a Phase B link reads the same filters", () => {
    expect(varsOf("?q=dune&shelf=read&author=Frank%20Herbert&tag=sf&sort=author&dir=desc")).toEqual({
      page: 1,
      limit: 50,
      sort: "author",
      sortDir: "desc",
      filter: { q: "dune", shelves: ["read"], authors: ["Frank Herbert"], tags: ["sf"] },
    });
    expect(varsOf("?shelf=all").filter).toBeUndefined();
  });

  it("every facet round-trips through the URL", () => {
    const search =
      "?q=earth&shelf=read&shelf=custom-comfort-reads&author=Ursula+K.+Le+Guin&series=Earthsea&tag=fantasy&tag=classic" +
      "&match=all&format=epub&lang=en&owned=1&file=1&read=2020-2024&stars=4-5&by=guin&sort=rating";
    const state = stateOf(search);
    expect(LIBRARY_CODEC.toParams(state).toString()).toBe(search.slice(1));
    expect(buildBooksVariables(state).filter).toEqual({
      q: "earth",
      shelves: ["read", "custom-comfort-reads"],
      authors: ["Ursula K. Le Guin"],
      series: ["Earthsea"],
      tags: ["fantasy", "classic"],
      tagMatch: "all",
      formats: ["epub"],
      languages: ["en"],
      owned: true,
      hasFile: true,
      readYearMin: 2020,
      readYearMax: 2024,
      ratingMin: 4,
      ratingMax: 5,
      authorText: "guin",
    });
  });

  it("junk falls back: stars outside 1–5, an unknown sort, a reversed read range is swapped", () => {
    const v = varsOf("?stars=0-9&sort=nope&read=2024-2020");
    expect(v.sort).toBe("title");
    expect(v.filter).toEqual({ readYearMin: 2020, readYearMax: 2024 });
  });

  it("Any/All is sent only alongside tags", () => {
    expect(varsOf("?match=all").filter).toBeUndefined();
    expect(varsOf("?match=all&tag=a").filter).toEqual({ tags: ["a"], tagMatch: "all" });
  });

  it("keeps every pre-C2 sort and adds a seeded shuffle", () => {
    expect(SORT_ORDER).toEqual(["title", "author", "dateAdded", "rating", "dateFinished", "pageCount", "publishedDate", "owned", "random"]);
    expect(varsOf("?sort=random&seed=42")).toEqual({ page: 1, limit: 50, sort: "random", sortDir: "asc", seed: 42 });
    // A new sort starts in its natural direction.
    expect(LIBRARY_CODEC.write(new URLSearchParams(""), { sort: "dateAdded" }).toString()).toBe("sort=dateAdded");
    expect(stateOf("?sort=dateAdded").dir).toBe("desc");
  });

  it("hasShelfParam tells a deep link's shelf from none", () => {
    expect(hasShelfParam("?shelf=read")).toBe(true);
    expect(hasShelfParam("?q=x")).toBe(false);
  });
});

describe("saved views", () => {
  it("a legacy view round-trips: it opens the list its old apply showed", () => {
    const search = savedViewSearch(LEGACY_VIEW);
    expect(search).toBe("?q=robot&shelf=unread&tag=science+fiction&by=Asimov&sort=dateAdded");
    expect(varsOf(search)).toEqual({
      page: 1,
      limit: 50,
      sort: "dateAdded",
      sortDir: "desc",
      // authorText, not authors: the old author filter was "contains".
      // No `owned`: the old library stored ownedFilter but never applied it.
      filter: { q: "robot", shelves: ["unread"], tags: ["science fiction"], authorText: "Asimov" },
    });
  });

  it("a view's raw tags open as the gateway maps them (viewTags), legacy and C2 alike", () => {
    // "Unread sci-fi": saved as the raw "science fiction".
    expect(savedViewSearch({ ...LEGACY_VIEW, viewTags: ["Sci-fi"] })).toBe("?q=robot&shelf=unread&tag=Sci-fi&by=Asimov&sort=dateAdded");
    // "Five-star memoirs": C2 filter JSON naming the raw "memoir".
    const memoirs = { sortBy: "rating", sortDir: "desc", tagFilter: "memoir", filter: { tags: ["memoir"], ratingMin: 5 }, viewTags: ["Memoir"] };
    expect(savedViewSearch(memoirs)).toBe("?tag=Memoir&stars=5-&sort=rating");
    // One raw tag can open on two.
    expect(savedViewSearch({ sortBy: "title", filter: { tags: ["Science Fiction Fantasy"] }, viewTags: ["Sci-fi", "Fantasy"] })).toBe("?tag=Sci-fi&tag=Fantasy");
    // A view with no tags stays tagless.
    expect(savedViewSearch({ sortBy: "title", filter: { shelves: ["read"] }, viewTags: [] })).toBe("?shelf=read");
  });

  it("a legacy view with nothing but a shelf, and one on 'all'", () => {
    const base = { sortBy: "title", sortDir: "asc", searchQuery: "", authorFilter: "", tagFilter: "" };
    expect(savedViewSearch({ ...base, shelfFilter: "on-reader" })).toBe("?shelf=on-reader");
    expect(savedViewSearch({ ...base, shelfFilter: "all" })).toBe("");
  });

  it("a C2 view opens from its whole filter, and wins over its legacy fields", () => {
    const view = { sortBy: "rating", sortDir: "desc", tagFilter: "ignored", filter: { tags: ["fantasy"], ratingMin: 5 } };
    expect(savedViewSearch(view)).toBe("?tag=fantasy&stars=5-&sort=rating");
  });

  it("a shuffled view gets a fresh shuffle, and still matches its canonical form", () => {
    const view = { sortBy: "random", sortDir: "asc", filter: { shelves: ["unread"] } };
    const a = savedViewSearch(view);
    expect(a).toMatch(/^\?shelf=unread&sort=random&seed=\d+$/);
    expect(canonicalSearch(a)).toBe(canonicalSearch("?sort=random&shelf=unread&seed=1"));
  });

  it("a new view carries the legacy fields an old tab can still open", () => {
    expect(legacyFieldsFor({ q: "dune", shelves: ["read"], tags: ["sf"] })).toEqual({
      searchQuery: "dune",
      authorFilter: "",
      tagFilter: "sf",
      shelfFilter: "read",
    });
    expect(legacyFieldsFor({ shelves: ["read", "unread"], tags: ["a", "b"] })).toMatchObject({ shelfFilter: "all", tagFilter: "" });
    expect(legacyFieldsFor(null)).toEqual({ searchQuery: "", authorFilter: "", tagFilter: "", shelfFilter: "all" });
  });
});
