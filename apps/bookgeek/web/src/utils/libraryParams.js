/**
 * The library's URL filter codec (hooks/useLibraryParams.jsx is the provider
 * that reads and writes it): `/?q=&shelf=&author=&tag=&sort=&dir=`, with
 * defaults left out so the bare `/` is the whole library.
 */
export const DEFAULT_SORT = "title";
export const DEFAULT_SORT_DIR = "asc";

const PARAM_KEYS = {
  searchQuery: "q",
  shelfFilter: "shelf",
  authorFilter: "author",
  tagFilter: "tag",
  sortBy: "sort",
  sortDir: "dir",
};

const DEFAULTS = {
  searchQuery: "",
  shelfFilter: "all",
  authorFilter: "",
  tagFilter: "",
  sortBy: DEFAULT_SORT,
  sortDir: DEFAULT_SORT_DIR,
};

/** The six filter values out of a query string, defaults filled in. */
export function readLibraryParams(search) {
  const params = new URLSearchParams(search || "");
  const out = {};
  for (const [name, key] of Object.entries(PARAM_KEYS)) {
    const value = params.get(key);
    out[name] = value == null || value === "" ? DEFAULTS[name] : value;
  }
  return out;
}

/** A query string ("?…" or "") with `patch` applied; defaults are dropped. */
export function writeLibraryParams(search, patch) {
  const params = new URLSearchParams(search || "");
  for (const [name, value] of Object.entries(patch)) {
    const key = PARAM_KEYS[name];
    if (!key) continue;
    if (value == null || value === "" || value === DEFAULTS[name]) params.delete(key);
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${ s }` : "";
}

/** Whether the URL names a shelf at all (a deep link wins over the saved default). */
export function hasShelfParam(search) {
  return new URLSearchParams(search || "").has(PARAM_KEYS.shelfFilter);
}

/** `GET_BOOKS` variables for the filters (the page is added by the caller). */
export function booksVariables(filters, { limit = 50 } = {}) {
  const variables = {
    limit,
    sort: filters.sortBy || DEFAULT_SORT,
    sortDir: filters.sortDir || DEFAULT_SORT_DIR,
  };
  if (filters.searchQuery.trim()) variables.q = filters.searchQuery.trim();
  if (filters.authorFilter.trim()) variables.author = filters.authorFilter.trim();
  if (filters.tagFilter.trim()) variables.tag = filters.tagFilter.trim();
  if (filters.shelfFilter !== "all") variables.shelf = filters.shelfFilter;
  return variables;
}
