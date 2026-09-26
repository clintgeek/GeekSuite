/**
 * The tag vocabulary's groups, for presenting the Tags facet and the book
 * page (DOCS/TAGS.md).
 *
 * LOCAL MIRROR of `TAG_GROUPS` in packages/schemas/bookgeek/tags.js — same
 * shape (`[{ id, label, tags }]`), same order, copied 2026-09-26, and pinned
 * by `__tests__/utils/tagGroups.test.js`. GameGeek's pattern: the web does
 * not depend on the schemas package (no workspace dep, and that module is
 * CommonJS and carries the synonym table the browser has no use for), so the
 * list is copied. The server owns every mapping decision; this file only
 * decides where a value SITS.
 *
 * A Tags facet value is one of three things:
 *   - a canonical tag  → its vocabulary group (Genre, Nonfiction, Audience, Flavour);
 *   - someone's own    → "My tags", first (the facet's `myTags` answer says which);
 *   - anything else    → "Unsorted", last and collapsed (raw tags the
 *                        vocabulary neither maps nor drops).
 */
export const TAG_GROUPS = [
  {
    id: "genre",
    label: "Genre",
    tags: [
      "Fantasy", "Sci-fi", "Mystery", "Thriller", "Horror", "Romance", "Literary", "Historical Fiction",
      "Classics", "Short Stories", "Poetry", "Graphic Novel", "Western", "Adventure", "Humor", "Contemporary",
    ],
  },
  {
    id: "nonfiction",
    label: "Nonfiction",
    tags: [
      "Memoir", "Biography", "History", "True Crime", "Science", "Popular Science", "Religion", "Philosophy",
      "Politics", "Business", "Self-help", "Travel", "Food", "Essays", "Psychology", "Health", "Technology",
    ],
  },
  {
    id: "audience",
    label: "Audience",
    tags: ["Young Adult", "Middle Grade", "Children's"],
  },
  {
    id: "flavour",
    label: "Flavour",
    tags: [
      "Space Opera", "Dystopia", "Post-apocalyptic", "Urban Fantasy", "Epic Fantasy", "Cyberpunk", "Time Travel",
      "Magic", "Supernatural", "Cults", "Crime", "Suspense", "Coming of Age", "War", "Dark", "Cozy", "Aliens",
      "Mythology", "Alternate History", "Zombies", "Espionage", "Survival", "Legal", "LGBTQ+",
    ],
  },
];

export const MY_TAGS_GROUP = "My tags";
export const UNSORTED_GROUP = "Unsorted";

/** The Tags facet's headings, in order. */
export const TAG_GROUP_ORDER = [MY_TAGS_GROUP, ...TAG_GROUPS.map((g) => g.label), UNSORTED_GROUP];

// Exact names: the server stores canonical tags in their canonical spelling,
// and a My tag spelled differently ("fantasy") is the person's, not Fantasy.
const GROUP_OF = new Map(TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t, g.label])));

/** Whether a value is a canonical tag. */
export const isCanonicalTag = (value) => GROUP_OF.has(value);

/**
 * `groupOf(value)` for the Tags facet, given the values that are someone's
 * own (`bookFacets.myTags`). A canonical name stays in its vocabulary group
 * even when someone also typed it — it is the same value.
 */
export function tagGroupOf(myTags = []) {
  const mine = new Set(myTags);
  return (value) => GROUP_OF.get(value) ?? (mine.has(value) ? MY_TAGS_GROUP : UNSORTED_GROUP);
}

/**
 * A book's tags for its page: the person's own first, then the canonical ones
 * in vocabulary order, then the Unsorted raw ones. `source` is the raw
 * import tags, untouched, for the "Source tags" disclosure.
 */
export function bookTagGroups(book) {
  const list = (v) => (Array.isArray(v) ? v.filter((t) => typeof t === "string" && t.trim()) : []);
  const mine = list(book?.myTags);
  const canonical = list(book?.libraryTags).filter((t) => !mine.includes(t));
  const unsorted = list(book?.unsortedTags).filter((t) => !mine.includes(t));
  return { mine, canonical, unsorted, source: list(book?.tags) };
}
