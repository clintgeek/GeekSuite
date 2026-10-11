/**
 * NewsGeek navigation: the one route → nav id → title map, read by the
 * sidebar (desktop), the tab bar (phone) and the top bar.
 *
 * Today (`/`) is the ranked front page (plan "Ranking: the briefing"); a
 * section's "More" opens `/s/:section` (that section, newest first);
 * Everything (`/everything`) is every story newest first with the section
 * flags — N0's Latest, moved. Sources is the desk.
 */
import { matchPath } from 'react-router-dom';
import { SECTION_LABEL } from '../utils/vocab';

export const APP_NAME = 'NewsGeek';
export const APP_ID = 'newsgeek';

export const NAV = { today: 'today', everything: 'everything', sources: 'sources', settings: 'settings' };

export const ROUTES = [
  { path: '/', navId: NAV.today, title: 'Today', tab: 'today' },
  // A section page is reached from Today's "More <section> →": Today stays lit, with a back arrow.
  { path: '/s/:section', navId: NAV.today, title: (p) => SECTION_LABEL[p.section] ?? 'Section', tab: 'today', back: true },
  { path: '/everything', navId: NAV.everything, title: 'Everything', tab: 'everything' },
  { path: '/sources', navId: NAV.sources, title: 'Sources', tab: 'sources' },
  { path: '/sources/:id', navId: NAV.sources, title: 'Source', tab: 'sources', back: true },
  // Phone: reached from the account menu (top bar), with a back arrow; md+: the sidebar footer.
  { path: '/settings', navId: NAV.settings, title: 'Settings', tab: null, back: true },
];

function match(pathname = '/') {
  for (const r of ROUTES) {
    const m = matchPath({ path: r.path, end: true }, pathname);
    if (m) return { route: r, params: m.params };
  }
  return null;
}

export function routeFor(pathname = '/') {
  return match(pathname)?.route ?? null;
}

export function titleFor(pathname) {
  const m = match(pathname);
  if (!m) return APP_NAME;
  return typeof m.route.title === 'function' ? m.route.title(m.params) : m.route.title;
}
export const activeNavId = (pathname) => routeFor(pathname)?.navId ?? null;
export const tabFor = (pathname) => routeFor(pathname)?.tab ?? null;
export const isBackPath = (pathname) => Boolean(routeFor(pathname)?.back);

/** Where the back arrow goes when there is no history to go back through (a deep link). */
export function backFallback(pathname = '/') {
  if (matchPath({ path: '/sources/:id', end: true }, pathname)) return '/sources';
  return '/';
}
