/**
 * The tag vocabulary (packages/schemas/bookgeek/tags.js) and the api's use of
 * it (src/tags.js, src/migrations/tags.js) — apps/bookgeek/DOCS/TAGS.md.
 *
 * Rules pinned here, each red/green checked when written:
 *   - synonyms map raw spellings to canonical tags, case- and punctuation-
 *     insensitively; one raw tag may map to several;
 *   - the drop list: Fiction, General, Novels, Adult, Literature, AUTO,
 *     Audiobook, dates, codes and non-English catalogue terms;
 *   - catalogue headings are split and every part that maps is kept;
 *     character/place headings are dropped;
 *   - at most 12 canonical tags per book, Flavour cut first;
 *   - anything neither mapped nor dropped is Unsorted, kept as written —
 *     including the tags TAGS.md names as possibly Chef's own;
 *   - saved-view tags map through the synonyms; canonical names normalise;
 *   - the Calibre re-import carries myTags across (and keeps an orphan);
 *   - the boot migration is idempotent and guarded on the tags it read;
 *   - every api path that writes `tags` derives the fields with it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { carryOverMyTags, withDerivedTags, tagVocabulary } from "../src/tags.js";
import { migrateTags, planTagMigration } from "../src/migrations/tags.js";

const {
  TAG_GROUPS,
  ALL_TAGS,
  MAX_LIBRARY_TAGS,
  classifyRawTag,
  canonicalTagName,
  deriveTagFields,
  cleanMyTags,
  mapViewTags,
  normalizeTagTerm,
} = tagVocabulary;

const kind = (raw) => classifyRawTag(raw).kind;
const mapped = (raw) => {
  const r = classifyRawTag(raw);
  return r.kind === "mapped" ? r.tags : r.kind;
};

describe("the vocabulary", () => {
  test("about 60 canonical tags in the four groups TAGS.md names, no duplicates", () => {
    assert.deepEqual(TAG_GROUPS.map((g) => g.label), ["Genre", "Nonfiction", "Audience", "Flavour"]);
    assert.equal(ALL_TAGS.length, 60);
    assert.equal(new Set(ALL_TAGS.map(normalizeTagTerm)).size, ALL_TAGS.length);
    assert.equal(MAX_LIBRARY_TAGS, 12);
  });

  test("every canonical tag maps to itself", () => {
    for (const tag of ALL_TAGS) assert.ok(mapped(tag).includes(tag), tag);
  });
});

describe("synonyms", () => {
  test("case, punctuation and spacing fold together", () => {
    assert.deepEqual(mapped("Thrillers"), ["Thriller"]);
    assert.deepEqual(mapped("thrillers"), ["Thriller"]);
    assert.deepEqual(mapped("Science Fiction"), ["Sci-fi"]);
    assert.deepEqual(mapped("science fiction"), ["Sci-fi"]);
    assert.deepEqual(mapped("Sci-Fi"), ["Sci-fi"]);
    assert.deepEqual(mapped("memoirs"), ["Memoir"]);
    assert.deepEqual(mapped("Childrens"), ["Children's"]);
    assert.deepEqual(mapped("Coming Of Age"), ["Coming of Age"]);
    assert.deepEqual(mapped("Action & Adventure"), ["Adventure"]);
  });

  test("one raw tag can map to several", () => {
    assert.deepEqual(mapped("Science Fiction Fantasy"), ["Sci-fi", "Fantasy"]);
    assert.deepEqual(mapped("Biography Memoir"), ["Biography", "Memoir"]);
    assert.deepEqual(mapped("Mystery Thriller"), ["Mystery", "Thriller"]);
    assert.deepEqual(mapped("sf_horror"), ["Sci-fi", "Horror"]);
    // A sub-genre counts under its genre too.
    assert.deepEqual(mapped("Urban Fantasy"), ["Urban Fantasy", "Fantasy"]);
  });

  test("canonicalTagName gives the canonical spelling, or null", () => {
    assert.equal(canonicalTagName("sci fi"), "Sci-fi");
    assert.equal(canonicalTagName("LGBTQ+"), "LGBTQ+");
    assert.equal(canonicalTagName("Thrillers"), null);
  });
});

describe("the drop list", () => {
  test("the broad and the import markers", () => {
    for (const raw of ["Fiction", "fiction", "General", "Novels", "Adult", "Literature", "AUTO", "Audiobook"]) {
      assert.equal(kind(raw), "dropped", raw);
    }
  });

  test("dates, centuries, codes and machine tags", () => {
    for (const raw of ["1922-2007", "1939-1945", "20Th Century", "Com060160", "Cs.cmp_sc.app_sw", "Qa76.73.p224",
      "award:hugo_award=1963", "nyt:series_books=2010-08-21", "Reading Level-Grade 10",
      "World War (1939-1945) fast (OCoLC)fst01180924"]) {
      assert.equal(kind(raw), "dropped", raw);
    }
  });

  test("non-English catalogue terms", () => {
    for (const raw of ["Novela juvenil", "Sites Web", "Romans, nouvelles", "Ficción", "Bücherverbrennung", "Webbdesign"]) {
      assert.equal(kind(raw), "dropped", raw);
    }
  });
});

describe("catalogue headings", () => {
  test("split on --, /, ->, ; and commas; every part that maps is kept", () => {
    assert.deepEqual(mapped("Fiction / Fantasy / Epic"), ["Fantasy", "Epic Fantasy"]);
    assert.deepEqual(mapped("Fiction, thrillers, suspense"), ["Thriller", "Suspense"]);
    assert.deepEqual(mapped("Interplanetary voyages -- Fiction."), ["Sci-fi"]);
    assert.deepEqual(mapped("Professional, career & trade -> computer science -> general"), ["Technology"]);
    assert.deepEqual(mapped("Pizzolatto;Klim;true detective;gangster;noir;texas"), ["Crime"]);
  });

  test("X (Fictitious character) and X (Imaginary place) are dropped; other qualifiers are stripped", () => {
    assert.equal(kind("Wiggin, Ender (Fictitious character) -- Fiction"), "dropped");
    assert.equal(kind("Dune (Imaginary place)"), "dropped");
    assert.deepEqual(mapped("JavaScript (Computer program language)"), ["Technology"]);
    assert.deepEqual(mapped("Short Stories (Single Author)"), ["Short Stories"]);
  });

  test("a heading whose parts map to nothing stays Unsorted, whole", () => {
    assert.equal(kind("Mars (Planet) -- Fiction."), "unsorted");
    assert.equal(kind("Children of God (Organization)"), "unsorted");
    assert.equal(kind("Manson, charles, 1934-2017"), "unsorted");
  });
});

describe("Unsorted: nothing that might be Chef's is lost", () => {
  test("the tags TAGS.md calls possibly personal stay Unsorted, as written", () => {
    const personal = ["jonestown", "kurt", "growing-up-poor", "Must Read", "Book Club"];
    for (const raw of personal) assert.equal(kind(raw), "unsorted", raw);
    const { libraryTags, unsortedTags } = deriveTagFields(["Fiction", ...personal, "Thrillers"]);
    assert.deepEqual(unsortedTags, personal);
    assert.deepEqual(libraryTags, ["Thriller"]);
  });

  test("deduped exactly, blanks ignored", () => {
    assert.deepEqual(deriveTagFields(["kurt", " kurt ", "", "Kurt"]).unsortedTags, ["kurt", "Kurt"]);
  });
});

describe("deriveTagFields", () => {
  test("ordered by group, then first appearance; deduped across raw tags", () => {
    const { libraryTags } = deriveTagFields(["Space Opera", "Memoir", "Science Fiction", "Young Adult", "sf"]);
    // Genre (Sci-fi), Nonfiction (Memoir), Audience (Young Adult), Flavour (Space Opera).
    assert.deepEqual(libraryTags, ["Sci-fi", "Memoir", "Young Adult", "Space Opera"]);
  });

  test("at most 12, Flavour cut first", () => {
    const raw = ["Dystopia", "Magic", "Cults", "War", "Dark", "Cozy", "Crime", "Fantasy", "Horror", "Romance",
      "Western", "Poetry", "Memoir", "History", "Young Adult"];
    const { libraryTags } = deriveTagFields(raw);
    assert.equal(libraryTags.length, 12);
    assert.deepEqual(libraryTags.slice(0, 9), ["Fantasy", "Horror", "Romance", "Western", "Poetry", "Memoir", "History", "Young Adult", "Dystopia"]);
    assert.ok(!libraryTags.includes("Cozy"));
  });

  test("no tags, or not an array, is empty", () => {
    assert.deepEqual(deriveTagFields(undefined), { libraryTags: [], unsortedTags: [] });
    assert.deepEqual(deriveTagFields([]), { libraryTags: [], unsortedTags: [] });
  });
});

describe("saved views and my tags", () => {
  test("mapViewTags maps raw tags, keeps Unsorted/My/dropped ones as saved", () => {
    assert.deepEqual(mapViewTags(["memoir"]), ["Memoir"]);
    assert.deepEqual(mapViewTags(["science fiction"]), ["Sci-fi"]);
    assert.deepEqual(mapViewTags(["Science Fiction Fantasy", "Sci-fi", "kurt", "AUTO"]), ["Sci-fi", "Fantasy", "kurt", "AUTO"]);
  });

  test("cleanMyTags trims and dedupes, and maps nothing", () => {
    assert.deepEqual(cleanMyTags([" thrillers", "thrillers", "", 3, "Beach read"]), ["thrillers", "Beach read"]);
  });
});

describe("the Calibre re-import keeps myTags", () => {
  const dune = { title: "Dune", authors: ["Frank Herbert"], isbn: "9780441013593", tags: ["Science Fiction"] };

  test("a re-imported book inherits the myTags of the book it replaces", () => {
    const existing = [{ _id: "old1", title: "Dune", authors: ["Frank Herbert"], isbn: "978-0441013593", myTags: ["desert"] }];
    const { docs, keepIds, carried } = carryOverMyTags(existing, [withDerivedTags(dune), { title: "Other", authors: [] }]);
    assert.deepEqual(docs[0].myTags, ["desert"]);
    assert.equal(docs[1].myTags, undefined);
    assert.deepEqual(keepIds, []);
    assert.equal(carried, 1);
  });

  test("matching falls back to title + first author", () => {
    const existing = [{ _id: "old1", title: "DUNE", authors: ["frank herbert"], myTags: ["desert"] }];
    const { docs } = carryOverMyTags(existing, [{ title: "Dune", authors: ["Frank Herbert"] }]);
    assert.deepEqual(docs[0].myTags, ["desert"]);
  });

  test("a book with myTags that is no longer in Calibre is kept, not deleted", () => {
    const existing = [{ _id: "gone", title: "Removed", authors: ["Nobody"], myTags: ["mine"] }];
    const { keepIds } = carryOverMyTags(existing, [dune]);
    assert.deepEqual(keepIds, ["gone"]);
  });

  test("withDerivedTags derives from the doc's own tags and leaves tags alone", () => {
    const doc = withDerivedTags(dune);
    assert.deepEqual(doc.tags, ["Science Fiction"]);
    assert.deepEqual(doc.libraryTags, ["Sci-fi"]);
    assert.deepEqual(doc.unsortedTags, []);
  });
});

/** A Book model over an in-memory array that applies updateOne ops as Mongo would (exact-array guard). */
function fakeBook(rows) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return {
    rows,
    find() {
      return { lean: async () => rows.map((r) => ({ ...r })) };
    },
    async bulkWrite(ops) {
      let modifiedCount = 0;
      for (const { updateOne } of ops) {
        const { _id, tags } = updateOne.filter;
        const row = rows.find((r) => r._id === _id);
        if (!row) continue;
        const guardOk = tags && tags.$exists === false ? !("tags" in row) : eq(row.tags, tags);
        if (!guardOk) continue;
        const before = JSON.stringify(row);
        Object.assign(row, updateOne.update.$set);
        if (JSON.stringify(row) !== before) modifiedCount += 1;
      }
      return { modifiedCount };
    },
  };
}

describe("the boot migration", () => {
  const library = () => [
    { _id: "a", tags: ["Thrillers", "kurt", "AUTO"] },
    { _id: "b", tags: ["Science Fiction"], libraryTags: ["Sci-fi"], unsortedTags: [] },
    { _id: "c" },
    { _id: "d", tags: ["Memoir"], libraryTags: ["History"], unsortedTags: [] },
  ];

  test("derives what is missing or stale, and leaves the rest", async () => {
    const Book = fakeBook(library());
    const lines = [];
    const out = await migrateTags({ Book, logger: { info: (_o, msg) => lines.push(msg) } });
    assert.equal(out.scanned, 4);
    assert.equal(out.changed, 3);
    assert.equal(out.fresh, 2);
    assert.deepEqual(Book.rows.find((r) => r._id === "a"), { _id: "a", tags: ["Thrillers", "kurt", "AUTO"], libraryTags: ["Thriller"], unsortedTags: ["kurt"] });
    assert.deepEqual(Book.rows.find((r) => r._id === "c"), { _id: "c", libraryTags: [], unsortedTags: [] });
    assert.deepEqual(Book.rows.find((r) => r._id === "d").libraryTags, ["Memoir"]);
    assert.equal(lines.length, 1, "one log line");
    assert.match(lines[0], /re-derived 3 book\(s\) of 4/);
  });

  test("is idempotent: a second run changes nothing", async () => {
    const Book = fakeBook(library());
    await migrateTags({ Book });
    const second = await migrateTags({ Book });
    assert.equal(second.planned, 0);
    assert.equal(second.changed, 0);
  });

  test("never touches tags or myTags, and a dry run writes nothing", async () => {
    const rows = [{ _id: "x", tags: ["Thrillers"], myTags: ["mine"] }];
    const Book = fakeBook(rows);
    const dry = await migrateTags({ Book, dryRun: true });
    assert.equal(dry.planned, 1);
    assert.equal(dry.changed, 0);
    assert.equal(rows[0].libraryTags, undefined);
    await migrateTags({ Book });
    assert.deepEqual(rows[0].tags, ["Thrillers"]);
    assert.deepEqual(rows[0].myTags, ["mine"]);
  });

  test("each update is guarded on the exact tags it read", () => {
    const { ops } = planTagMigration([{ _id: "a", tags: ["Thrillers"] }, { _id: "c" }]);
    assert.deepEqual(ops[0].updateOne.filter, { _id: "a", tags: ["Thrillers"] });
    assert.deepEqual(ops[1].updateOne.filter, { _id: "c", tags: { $exists: false } });
    assert.deepEqual(Object.keys(ops[0].updateOne.update.$set).sort(), ["libraryTags", "unsortedTags"]);
  });

  test("a book edited between read and write is skipped, not overwritten", async () => {
    const rows = [{ _id: "a", tags: ["Thrillers"] }];
    const Book = fakeBook(rows);
    const realFind = Book.find;
    Book.find = () => {
      const q = realFind();
      return { lean: async () => { const read = await q.lean(); rows[0].tags = ["Horror"]; return read; } };
    };
    const out = await migrateTags({ Book });
    assert.equal(out.changed, 0);
    assert.equal(rows[0].libraryTags, undefined);
  });
});

describe("every api path that writes tags derives the fields", () => {
  const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

  test("the Calibre import and the rescan's new books", () => {
    const src = read("../src/routes/importRoutes.js");
    assert.ok(src.includes("docs.push(withDerivedTags(doc))"), "POST /calibre");
    assert.ok(src.includes("await Book.create(withDerivedTags(doc))"), "POST /calibre/rescan (new books)");
    assert.ok(src.includes("carryOverMyTags(previousWithMyTags, docs)"), "POST /calibre carries myTags");
  });

  test("enrich, which merges provider subjects into tags", () => {
    const src = read("../src/routes/bookFileRoutes.js");
    assert.ok(src.includes("if (Array.isArray(update.tags)) Object.assign(update, deriveTagFields(update.tags));"));
  });

  test("boot runs the migration before listen", () => {
    const src = read("../src/server.js");
    assert.ok(src.indexOf("migrateTags({ Book, logger })") > 0);
    assert.ok(src.indexOf("migrateTags({ Book, logger })") < src.indexOf("app.listen("));
  });
});
