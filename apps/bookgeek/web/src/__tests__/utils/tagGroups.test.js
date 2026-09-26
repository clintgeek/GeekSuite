/**
 * utils/tagGroups.js — the web's mirror of the tag vocabulary's groups
 * (DOCS/TAGS.md), and where a Tags facet value sits.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { groupOptions } from "@geeksuite/collection";
import { MY_TAGS_GROUP, TAG_GROUPS, TAG_GROUP_ORDER, UNSORTED_GROUP, bookTagGroups, isCanonicalTag, tagGroupOf } from "../../utils/tagGroups";

const require = createRequire(import.meta.url);

describe("tag groups", () => {
  it("mirror the server vocabulary exactly (packages/schemas/bookgeek/tags.js)", () => {
    const server = require("../../../../../../packages/schemas/bookgeek/tags.js");
    expect(TAG_GROUPS).toEqual(JSON.parse(JSON.stringify(server.TAG_GROUPS)));
    expect([MY_TAGS_GROUP, UNSORTED_GROUP]).toEqual([server.MY_TAGS_GROUP, server.UNSORTED_GROUP]);
  });

  it("order: My tags, the four vocabulary groups, Unsorted last", () => {
    expect(TAG_GROUP_ORDER).toEqual(["My tags", "Genre", "Nonfiction", "Audience", "Flavour", "Unsorted"]);
  });

  it("a canonical name is in its group; someone's own is My tags; anything else is Unsorted", () => {
    const groupOf = tagGroupOf(["Beach read", "Fantasy"]);
    expect(groupOf("Sci-fi")).toBe("Genre");
    expect(groupOf("Memoir")).toBe("Nonfiction");
    expect(groupOf("Space Opera")).toBe("Flavour");
    // Typed as a My tag, a canonical name is still the canonical value.
    expect(groupOf("Fantasy")).toBe("Genre");
    expect(groupOf("Beach read")).toBe("My tags");
    // Exact names only: a differently-spelled value is not canonical.
    expect(isCanonicalTag("fantasy")).toBe(false);
    expect(groupOf("jonestown")).toBe("Unsorted");
    const groups = groupOptions([{ value: "jonestown" }, { value: "Beach read" }, { value: "Sci-fi" }], groupOf, TAG_GROUP_ORDER);
    expect(groups.map((g) => g.group)).toEqual(["My tags", "Genre", "Unsorted"]);
  });

  it("a book's tags for its page: canonical and mine as chips, raw tags as the source", () => {
    const book = { tags: ["Science Fiction", "kurt", "AUTO"], libraryTags: ["Sci-fi"], unsortedTags: ["kurt"], myTags: ["Beach read"] };
    expect(bookTagGroups(book)).toEqual({ mine: ["Beach read"], canonical: ["Sci-fi"], unsorted: ["kurt"], source: ["Science Fiction", "kurt", "AUTO"] });
    expect(bookTagGroups({})).toEqual({ mine: [], canonical: [], unsorted: [], source: [] });
  });
});
