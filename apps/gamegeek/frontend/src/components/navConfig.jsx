/**
 * GameGeek navigation config — the single route → nav id → title map.
 *
 * The sidebar's active row and the top bar's title both come from here, so a
 * screen can never be called one thing in one surface and another in the
 * other. The detail sheet (`/game/:id`) and the add dialog (`/add`) are
 * overlays on the library, so they keep the library's nav id and title — the
 * row under the sheet stays lit.
 *
 * Only two destinations exist tonight (Library, Settings). Tonight / Journal /
 * Stats (plan §5.2) get routes and a bottom nav when they are real, not as
 * placeholder tabs.
 */
import { matchPath } from 'react-router-dom';

export const APP_NAME = 'GameGeek';
export const APP_ID = 'gamegeek';

export const LIBRARY_NAV_ID = 'library';
/** Matches GeekSidebar's default `footer.settings.id`. */
export const SETTINGS_NAV_ID = 'settings';

export const ROUTES = [
  { path: '/', navId: LIBRARY_NAV_ID, title: 'Library', library: true },
  { path: '/game/:id', navId: LIBRARY_NAV_ID, title: 'Library', library: true, overlay: 'detail' },
  { path: '/add', navId: LIBRARY_NAV_ID, title: 'Library', library: true, overlay: 'add' },
  { path: '/settings', navId: SETTINGS_NAV_ID, title: 'Settings', library: false },
];

/** Sidebar row id for a shelf; namespaced so it can never collide with a route. */
export function shelfNavId(shelfId) {
  return `shelf:${shelfId}`;
}

export function routeFor(pathname = '/') {
  return ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname)) ?? null;
}

/** Top bar title for a path. Unknown paths read as the app name. */
export function titleFor(pathname) {
  return routeFor(pathname)?.title ?? APP_NAME;
}

/** Whether the path shows the library (itself, or under an overlay). */
export function isLibraryPath(pathname) {
  return Boolean(routeFor(pathname)?.library);
}

/**
 * The sidebar row that owns the current location:
 *   /settings                  → Settings
 *   library, no shelf (or all) → Library
 *   library, ?shelf=backlog    → that shelf's row (exactly one shelf)
 */
export function activeNavId(pathname, search = '') {
  const route = routeFor(pathname);
  if (!route) return null;
  if (route.navId !== LIBRARY_NAV_ID) return route.navId;
  // One shelf lights its row; none, or several (a multi-shelf filter), is the library.
  const shelves = new URLSearchParams(search).getAll('shelf').filter((s) => s && s !== 'all');
  return shelves.length === 1 ? shelfNavId(shelves[0]) : LIBRARY_NAV_ID;
}

/** `/game/:id` keeping the library's query string, so closing returns to it. */
export function gamePath(id, search = '') {
  return `/game/${encodeURIComponent(id)}${search || ''}`;
}

export function libraryPath(search = '') {
  return `/${search || ''}`;
}

/** The FAB belongs to the library, and not while one of its overlays is up. */
export function isFabVisible(pathname) {
  const route = routeFor(pathname);
  return Boolean(route?.library && !route.overlay);
}
