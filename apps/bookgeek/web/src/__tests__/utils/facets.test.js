/**
 * utils/facets.js — BookGeek's words for the shared filter panel and chips.
 */
import { describe, expect, it } from "vitest";
import { sectionOptions } from "@geeksuite/collection";
import { SECTIONS, activeChips, languageLabel, sectionsFor, shelfLabel, starsLabel } from "../../utils/facets";
import { readLibraryState } from "../../utils/libraryFilter";
import { FACETS, SHELVES } from "../fixtures";

const stateOf = (search) => readLibraryState(new URLSearchParams(search));

describe("labels", () => {
  it("shelves read as the reader names them, someone else's custom shelf from its id", () => {
    expect(shelfLabel("want-to-read", SHELVES)).toBe("Want to read");
    expect(shelfLabel("custom-comfort-reads", SHELVES)).toBe("Comfort reads");
    expect(shelfLabel("custom-beach-reads", SHELVES)).toBe("Beach reads");
  });

  it("ratings and languages in words", () => {
    expect(starsLabel(4, 5)).toBe("4★–5★");
    expect(starsLabel(5, 5)).toBe("5★");
    expect(starsLabel(3, null)).toBe("3★ or more");
    expect(starsLabel(null, 2)).toBe("Up to 2★");
    expect(languageLabel("en")).toBe("English");
    expect(languageLabel("Klingon-ish")).toBe("Klingon-ish");
  });
});

describe("sections", () => {
  it("shelves come in the sidebar's order, the reader's own after the built-ins, empty ones hidden", () => {
    const shelf = SECTIONS.find((s) => s.id === "shelf");
    const options = sectionOptions(shelf, { facets: { base: FACETS, current: FACETS }, filter: stateOf("").filter, context: { shelves: SHELVES } });
    expect(options.map((o) => o.label)).toEqual(["Reading", "On Reader", "Unread", "Read", "Want to read", "Comfort reads"]);
  });

  it("tags are one searchable list — no vocabulary groups", () => {
    const tags = SECTIONS.find((s) => s.id === "tags");
    expect(tags.kind).toBe("grouped");
    expect(tags.groupOf).toBeUndefined();
  });

  it("Language shows only when there is a choice to make", () => {
    const ids = (facets, search = "") => sectionsFor(facets, stateOf(search).filter).map((s) => s.id);
    expect(ids({ base: FACETS })).not.toContain("language");
    expect(ids({ base: { ...FACETS, languages: [{ value: "en", count: 1 }, { value: "de", count: 1 }] } })).toContain("language");
    expect(ids({ base: FACETS }, "?lang=en")).toContain("language");
  });
});

describe("chips", () => {
  it("in panel order, each removing exactly itself", () => {
    const chips = activeChips(
      stateOf("?q=dune&shelf=custom-comfort-reads&author=Frank+Herbert&tag=a&tag=b&match=all&format=epub&owned=1&file=1&read=2020-&stars=4-5&by=herb"),
      { shelves: SHELVES }
    );
    expect(chips.map((c) => `${ c.group }: ${ c.label }`)).toEqual([
      "Search: “dune”",
      "Shelf: Comfort reads",
      "Author: Frank Herbert",
      "Author contains: “herb”",
      "Tag: a",
      "Tag: b",
      "Match: All of them",
      "Format: EPUB",
      "Owned: Yes",
      "File: Has one",
      "Read: 2020 or later",
      "Rating: 4★–5★",
    ]);
    expect(chips.find((c) => c.id === "tags:a").patch).toEqual({ tags: ["b"] });
    expect(chips.find((c) => c.id === "stars").patch).toEqual({ ratingMin: null, ratingMax: null });
  });
});
