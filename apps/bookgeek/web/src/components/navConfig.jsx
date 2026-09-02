/**
 * BookGeek navigation config — one source of truth for the sidebar's nav ids
 * and the top bar's page title.
 *
 * BookGeek has no router: views are `activeView` state ("library" | "profile")
 * and the shelf being browsed is `shelfFilter`. So the sidebar's `activeId` is
 * derived from that pair here, and the top bar title is derived from the same
 * map, so a view can never be named one thing in one surface and another in
 * the other (THE_UI_UNIFICATION_PLAN.md §3).
 */

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
