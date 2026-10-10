/**
 * NewsGeek navigation: the one route → nav id → title map, read by the
 * sidebar (desktop), the tab bar (phone) and the top bar.
 *
 * N0 has two places: Latest (the chronological reading view) and Sources.
 * N2 adds Briefing, Saved and Settings; the tab bar and sidebar are laid
 * out so they slot in without a reshuffle (Briefing takes `/`, Latest moves
 * under it).
 */
import { matchPath } from 'react-router-dom';

export const APP_NAME = 'NewsGeek';
export const APP_ID = 'newsgeek';

export const NAV = { latest: 'latest', sources: 'sources', settings: 'settings' };

export const ROUTES = [
  { path: '/', navId: NAV.latest, title: 'Latest', tab: 'latest' },
  { path: '/sources', navId: NAV.sources, title: 'Sources', tab: 'sources' },
  { path: '/sources/:id', navId: NAV.sources, title: 'Source', tab: 'sources', back: true },
];

export function routeFor(pathname = '/') {
  return ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname)) ?? null;
}

export const titleFor = (pathname) => routeFor(pathname)?.title ?? APP_NAME;
export const activeNavId = (pathname) => routeFor(pathname)?.navId ?? null;
export const tabFor = (pathname) => routeFor(pathname)?.tab ?? null;
export const isBackPath = (pathname) => Boolean(routeFor(pathname)?.back);
