/**
 * TodoGeek navigation — one source of truth for the sidebar, the mobile tab
 * bar and the top bar's page title.
 *
 * Three views and search (DOCS/SIMPLE_PLAN.md Phase 1). Everything else the
 * app used to have — Review, Plan, Tags, Collections, Habits, Templates,
 * Settings — is out of the UI; its routes redirect to Today (see
 * `RETIRED_PATHS` in App.jsx). The data is untouched.
 */
import { CalendarCheck, CalendarRange, CheckSquare, Search } from 'lucide-react';

export const navSections = [
  {
    label: null,
    items: [
      { id: '/today', label: 'Today', to: '/today', Icon: CalendarCheck },
      { id: '/upcoming', label: 'Upcoming', to: '/upcoming', Icon: CalendarRange },
      { id: '/done', label: 'Done', to: '/done', Icon: CheckSquare },
      { id: '/search', label: 'Search', to: '/search', Icon: Search },
    ],
  },
];

export const navItems = navSections.flatMap((section) => section.items);

/** The nav row that owns a pathname (its own subtree included). */
export function activeNavId(pathname) {
  const match = navItems
    .filter((item) => pathname === item.id || pathname.startsWith(`${item.id}/`))
    .sort((a, b) => b.id.length - a.id.length)[0];
  return match?.id;
}

/** Top bar title: the current view's name, or "TodoGeek" when nothing matches. */
export function pageTitle(pathname) {
  const id = activeNavId(pathname);
  const item = navItems.find((entry) => entry.id === id);
  return item?.label ?? 'TodoGeek';
}

/**
 * Screens that are out of the UI. Their URLs land on Today; their pages,
 * resolvers and data are untouched (the code goes in Phase 4, once Chef has
 * lived without it). `/tasks/*` are the pre-2026 legacy URLs.
 */
export const RETIRED_PATHS = [
  '/review',
  '/plan',
  '/plan/*',
  '/templates',
  '/templates/*',
  '/tags',
  '/tags/*',
  '/collections',
  '/collections/*',
  '/habits',
  '/habits/*',
  '/journal',
  '/journal/*',
  '/migration',
  '/blocked',
  '/backlog',
  '/settings',
  '/settings/*',
  '/tasks/*',
];
