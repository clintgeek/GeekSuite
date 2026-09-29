/**
 * ThingGeek navigation config — the single route → nav id → title map.
 *
 * The sidebar's active row, the top bar's title and whether the library is
 * mounted all come from here, so a screen can never be called one thing in
 * one surface and another in the other. A thing's page (`/thing/:id`) and
 * the add screen (`/add`) are pages of their own (Label Maker, 2026-09-29):
 * on a phone they get a back arrow instead of a menu, and the library
 * remembers its scroll for the way back.
 *
 * The phone's paths are the tab bar (components/BottomTabs.jsx): Things ·
 * Where · Add · Attention · More. `tabFor()` says which tab a route lights.
 */
import { matchPath } from 'react-router-dom';

export const APP_NAME = 'ThingGeek';
export const APP_ID = 'thinggeek';

export const NAV = {
  library: 'library',
  attention: 'attention',
  where: 'where',
  types: 'types',
  insurance: 'insurance',
  trash: 'trash',
  /** Matches GeekSidebar's default `footer.settings.id`. */
  settings: 'settings',
};

/** `tab`: the phone tab it lights. `back`: a sub-page — a back arrow, not a title-only bar. */
export const ROUTES = [
  { path: '/', navId: NAV.library, title: 'Things', library: true, tab: 'things' },
  { path: '/thing/:id', navId: NAV.library, title: 'Thing', tab: 'things', back: true },
  { path: '/add', navId: NAV.library, title: 'Add a thing', tab: 'add', back: true },
  { path: '/attention', navId: NAV.attention, title: 'Needs attention', tab: 'attention' },
  { path: '/where', navId: NAV.where, title: 'Where', tab: 'where' },
  { path: '/types', navId: NAV.types, title: 'Types', tab: 'more' },
  { path: '/insurance', navId: NAV.insurance, title: 'Insurance report', tab: 'more' },
  { path: '/trash', navId: NAV.trash, title: 'Trash', tab: 'more' },
  { path: '/settings', navId: NAV.settings, title: 'Settings', tab: 'more' },
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

/** The phone tab a route lights (null: none — an unknown path). */
export function tabFor(pathname) {
  return routeFor(pathname)?.tab ?? null;
}

/** A sub-page: the phone's top bar shows a back arrow. */
export function isBackPath(pathname) {
  return Boolean(routeFor(pathname)?.back);
}

/** The add screen carries its own Save bar; the tab bar steps aside for it. */
export function hidesTabBar(pathname) {
  return routeFor(pathname)?.tab === 'add';
}
