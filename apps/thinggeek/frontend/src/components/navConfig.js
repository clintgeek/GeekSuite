/**
 * ThingGeek navigation config — the single route → nav id → title map.
 *
 * The sidebar's active row, the top bar's title and whether the library is
 * mounted all come from here, so a screen can never be called one thing in
 * one surface and another in the other. The detail sheet (`/thing/:id`) and
 * the add flow (`/add`) are overlays on the library: they keep the library's
 * nav id and title, and the library stays mounted underneath.
 */
import { matchPath } from 'react-router-dom';

export const APP_NAME = 'ThingGeek';
export const APP_ID = 'thinggeek';

export const NAV = {
  library: 'library',
  attention: 'attention',
  places: 'places',
  types: 'types',
  insurance: 'insurance',
  trash: 'trash',
  /** Matches GeekSidebar's default `footer.settings.id`. */
  settings: 'settings',
};

export const ROUTES = [
  { path: '/', navId: NAV.library, title: 'Library', library: true },
  { path: '/thing/:id', navId: NAV.library, title: 'Library', library: true, overlay: 'detail' },
  { path: '/add', navId: NAV.library, title: 'Library', library: true, overlay: 'add' },
  { path: '/attention', navId: NAV.attention, title: 'Needs attention' },
  { path: '/places', navId: NAV.places, title: 'Places' },
  { path: '/types', navId: NAV.types, title: 'Types' },
  { path: '/insurance', navId: NAV.insurance, title: 'Insurance report' },
  { path: '/trash', navId: NAV.trash, title: 'Trash' },
  { path: '/settings', navId: NAV.settings, title: 'Settings' },
];

export function routeFor(pathname = '/') {
  return ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname)) ?? null;
}

export function titleFor(pathname) {
  return routeFor(pathname)?.title ?? APP_NAME;
}

export function isLibraryPath(pathname) {
  return Boolean(routeFor(pathname)?.library);
}

export function activeNavId(pathname) {
  return routeFor(pathname)?.navId ?? null;
}

/** `/thing/:id` keeping the library's query string, so closing returns to it. */
export function thingPath(id, search = '') {
  return `/thing/${encodeURIComponent(id)}${search || ''}`;
}

export function libraryPath(search = '') {
  return `/${search || ''}`;
}

/** The FAB belongs to the library, and not while one of its overlays is up. */
export function isFabVisible(pathname) {
  const route = routeFor(pathname);
  return Boolean(route?.library && !route.overlay);
}
