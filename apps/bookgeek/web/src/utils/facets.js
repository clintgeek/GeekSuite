/**
 * BookGeek's filter panel and chips, as config for `@geeksuite/collection`
 * (which builds the options from the two `bookFacets` answers, renders the
 * sections and builds the chips — see its facets/options.js for the
 * base/current rule).
 *
 * What is BookGeek's here: which sections and in what order, their wording,
 * the shelf order (built-ins, then the reader's own shelves), and the chip
 * order. Tags are ONE searchable list: Calibre tags are user-curated, so
 * there is no vocabulary to group them under (DOCS/BOOKGEEK_CLEANUP_PLAN.md
 * Phase C — "likely no vocabulary mapping").
 *
 * The `context` every label/fixed function gets is `{ shelves }` — the
 * profile's composed shelf list (hooks/useProfile.js `composeShelves`), so a
 * custom shelf reads "Comfort reads", not "custom-comfort-reads".
 */
import { buildActiveChips } from "@geeksuite/collection";
import { BUILT_IN_SHELVES } from "../hooks/useProfile";
import { LIBRARY_CODEC } from "./libraryFilter";

const BUILT_IN_ORDER = BUILT_IN_SHELVES.map((s) => s.id).filter((id) => id !== "all");

/**
 * "Want to read"; a custom shelf's own label. The library is shared but
 * custom shelves are per-person, so a book can sit on someone else's shelf:
 * that one reads from its id ("custom-beach-reads" → "Beach reads").
 */
export function shelfLabel(id, shelves = []) {
  const known = shelves.find((s) => s.id === id)?.label ?? BUILT_IN_SHELVES.find((s) => s.id === id)?.label;
  if (known) return known;
  const words = String(id).replace(/^custom-/, "").replace(/-+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(id);
}

/** "EPUB", "AZW3", "PDF". */
export const formatLabel = (value) => String(value).toUpperCase();

let languageNames = null;
/** "en" → "English" where the browser knows the code; anything else as stored. */
export function languageLabel(value) {
  try {
    languageNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    const name = languageNames.of(String(value));
    return name && name !== value ? name : String(value);
  } catch {
    return String(value);
  }
}

const STARS = ["", "★", "★★", "★★★", "★★★★", "★★★★★"];

/** "4★–5★", "5★", "3★ or more", "Up to 2★" — a rating range in words. */
export function starsLabel(min, max) {
  const s = (n) => `${ n }★`;
  if (min != null && max != null) return min === max ? s(min) : `${ s(min) }–${ s(max) }`;
  if (min != null) return `${ s(min) } or more`;
  return `Up to ${ s(max) }`;
}

/** Human label for a value in a filter key. */
export function valueLabel(key, value, { shelves = [] } = {}) {
  switch (key) {
    case "shelves":
      return shelfLabel(value, shelves);
    case "formats":
      return formatLabel(value);
    case "languages":
      return languageLabel(value);
    default:
      return value;
  }
}

/** The shelf order: the built-ins as the sidebar lists them, then the reader's own. */
function shelfOrder(shelves = []) {
  return [...BUILT_IN_ORDER, ...shelves.filter((s) => s.custom).map((s) => s.id)];
}

/**
 * The sections, in panel order: where the book sits (shelf), who and what
 * it is (author, series, tags), then the copy (format, owned, has a file),
 * then the reading record (read year, rating). Language is added only when
 * the library has more than one (`sectionsFor`).
 *
 * `facet` is the BookFacets field, `key` the BookFilterInput field.
 */
const SECTION_DEFS = [
  { id: "shelf", title: "Shelf", kind: "list", key: "shelves", facet: "shelves", fixed: ({ shelves } = {}) => shelfOrder(shelves) },
  {
    // Hundreds of authors: the most common first, a search box for the rest.
    id: "author",
    title: "Author",
    kind: "grouped",
    key: "authors",
    facet: "authors",
    limit: 8,
    itemNoun: { one: "author", many: "authors" },
    emptyText: "No authors recorded yet.",
  },
  {
    id: "series",
    title: "Series",
    kind: "grouped",
    key: "series",
    facet: "series",
    limit: 6,
    itemNoun: { one: "series", many: "series" },
    emptyText: "No series recorded yet. Calibre imports bring them in.",
  },
  {
    id: "tags",
    title: "Tags",
    kind: "grouped",
    key: "tags",
    facet: "tags",
    limit: 12,
    itemNoun: { one: "tag", many: "tags" },
    emptyText: "No tags yet. Calibre imports bring your tags in, and tags you add show here too.",
    match: { key: "tagMatch", over: ["tags"], text: "of the chosen tags" },
  },
  {
    id: "format",
    title: "Format",
    kind: "list",
    key: "formats",
    facet: "formats",
    limit: 6,
    emptyText: "No files attached yet.",
  },
  { id: "language", title: "Language", kind: "list", key: "languages", facet: "languages", limit: 6 },
  {
    id: "copy",
    title: "Copy",
    kind: "switch",
    switches: [
      { key: "owned", label: "Books I own", countFacet: "owned" },
      { key: "hasFile", label: "Has a file", countFacet: "hasFile" },
    ],
  },
  {
    id: "read",
    title: "Year read",
    kind: "range",
    facet: "readYears",
    bucketKey: "year",
    minKey: "readYearMin",
    maxKey: "readYearMax",
    labels: {
      any: "Any year",
      empty: "No finished dates recorded yet.",
      single: (lo) => `Every finished book here was finished in ${ lo }.`,
      minAria: "Earliest year read",
      maxAria: "Latest year read",
    },
  },
  {
    id: "rating",
    title: "My rating",
    kind: "range",
    facet: "ratings",
    bucketKey: "rating",
    minKey: "ratingMin",
    maxKey: "ratingMax",
    labels: {
      any: "Any rating",
      empty: "No ratings yet.",
      single: (lo) => `Every rated book here has ${ STARS[lo] ?? `${ lo }★` }.`,
      minAria: "Lowest rating",
      maxAria: "Highest rating",
    },
  },
];

export const SECTIONS = SECTION_DEFS.map((s) =>
  s.key ? { ...s, label: (value, context) => valueLabel(s.key, value, context) } : s
);

/**
 * The sections to show for this library: Language only once there is a
 * choice to make (more than one language, or one already picked).
 */
export function sectionsFor(facets, filter = {}) {
  const languages = facets?.base?.languages?.length ?? 0;
  if (languages > 1 || filter.languages?.length) return SECTIONS;
  return SECTIONS.filter((s) => s.id !== "language");
}

/** Sections open until the person closes them. The rest start closed. */
export const DEFAULT_OPEN = { shelf: true, author: true, tags: true, format: true, copy: true, read: true, rating: true };

/** localStorage key for the remembered open/closed sections. */
export const SECTIONS_OPEN_KEY = "bookgeek.filterSections";

const listChip = (key, group) => ({ kind: "list", key, group, label: (value, context) => valueLabel(key, value, context) });

/** The active-filter chips, in panel order. */
export const CHIP_SPECS = [
  { kind: "search", key: "q", group: "Search" },
  listChip("shelves", "Shelf"),
  listChip("authors", "Author"),
  // The legacy "contains" author, from a saved filter made before C2.
  { kind: "search", id: "authorText", key: "authorText", group: "Author contains" },
  listChip("series", "Series"),
  listChip("tags", "Tag"),
  {
    kind: "custom",
    build: ({ filter: f }) =>
      f.tagMatch === "all" && f.tags.length > 1
        ? [{ id: "tagMatch", group: "Match", label: "All of them", patch: { tagMatch: "any" }, modifier: true }]
        : [],
  },
  listChip("formats", "Format"),
  listChip("languages", "Language"),
  { kind: "boolean", key: "owned", group: "Owned", labels: { true: "Yes", false: "No" } },
  { kind: "flag", key: "hasFile", group: "File", label: "Has one" },
  { kind: "range", id: "read", group: "Read", minKey: "readYearMin", maxKey: "readYearMax" },
  { kind: "range", id: "stars", group: "Rating", minKey: "ratingMin", maxKey: "ratingMax", format: starsLabel },
];

/**
 * The active-filter chips. Each carries the `patch` that removes exactly
 * it, computed against the state it was built from.
 */
export function activeChips(state, { shelves = [] } = {}) {
  return buildActiveChips(LIBRARY_CODEC, state, CHIP_SPECS, { shelves });
}
