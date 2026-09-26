/**
 * BookGeek navigation config — one source of truth for the routes, the
 * sidebar's nav ids and the top bar's page title.
 *
 * Routes (App.jsx), since Phase B of DOCS/BOOKGEEK_CLEANUP_PLAN.md:
 *   /            the library (filters in the query string — hooks/useLibraryParams)
 *   /book/:id    the detail sheet, a child route OVER the mounted library
 *   /settings    Settings
 * The views still speak the old two names — `activeView` "library" |
 * "profile" — so `viewForPath` maps a path onto them, and the sidebar's
 * `activeId` and the title are derived from that pair here, so a view can
 * never be named one thing in one surface and another in the other
 * (THE_UI_UNIFICATION_PLAN.md §3).
 */
import { matchPath } from "react-router-dom";

export const LIBRARY_PATH = "/";
export const SETTINGS_PATH = "/settings";
export const BOOK_PATH = "/book/:id";

/** "profile" on /settings; everything else (the library, a sheet over it) is "library". */
export function viewForPath(pathname = "/") {
  return matchPath({ path: SETTINGS_PATH, end: true }, pathname) ? "profile" : "library";
}

/** `/book/:id`, keeping the library's query string so closing returns to it. */
export function bookPath(id, search = "") {
  return `/book/${ encodeURIComponent(id) }${ search || "" }`;
}

export function libraryPath(search = "") {
  return `${ LIBRARY_PATH }${ search || "" }`;
}

export const APP_NAME = "BookGeek";

/** The library nav row *is* the unfiltered library ("All books"). */
export const LIBRARY_NAV_ID = "library";

/** Matches `GeekSidebar`'s default `footer.settings.id`. */
export const SETTINGS_NAV_ID = "settings";

/** Sidebar row id for a shelf. Namespaced so it cannot collide with a view. */
export function shelfNavId(shelfId) {
  return `shelf:${ shelfId }`;
}

/** Top bar title per view. `profile` is the Settings view in BookGeek. */
const VIEW_TITLES = {
  library: "Library",
  profile: "Settings",
};

/** Top bar title: the current view's name, or the app name if it is unknown. */
export function viewTitle(activeView) {
  return VIEW_TITLES[activeView] ?? APP_NAME;
}

/**
 * The sidebar row that owns the current state:
 *   Settings view      → the footer Settings row
 *   library, all books → the Library row
 *   library, one shelf → that shelf's row
 */
export function activeNavId({ activeView, shelfFilter }) {
  if (activeView === "profile") return SETTINGS_NAV_ID;
  if (!shelfFilter || shelfFilter === "all") return LIBRARY_NAV_ID;
  return shelfNavId(shelfFilter);
}

/**
 * Book count for a shelf row's badge. `null` when the summary has not loaded —
 * `GeekSidebar` renders no badge for null or 0, which is quieter than the old
 * panel's "--" placeholder.
 */
export function shelfCount(shelfSummary, shelfId) {
  if (!shelfSummary) return null;
  if (shelfId === "all") return shelfSummary.total ?? null;
  return shelfSummary.shelves?.find((entry) => entry.id === shelfId)?.count ?? null;
}

/**
 * Whether the library's "Add book" FAB should hide: off the library view, in
 * select mode, or with anything already in the device basket (its own band
 * carries "Download to device" instead). Extracted from the inline `App.jsx`
 * expression so it has one testable name.
 */
export function isFabHidden({ activeView, selectMode, basketBookIds }) {
  return activeView !== "library" || Boolean(selectMode) || (basketBookIds?.length ?? 0) > 0;
}
