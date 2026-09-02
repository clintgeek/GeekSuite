/**
 * BuJoGeek navigation config — one source of truth for the sidebar sections,
 * the mobile tab bar / More sheet, and the top bar's page title.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants grouped nav in the
 * sidebar and a real page title in the top bar. All three surfaces are
 * derived from the same list so a new route can never appear in one and not
 * the others.
 *
 * The two sections mirror the mobile split on purpose: "Journal" is the
 * bottom tab bar's four primary tabs, "Library" is its "More" sheet.
 */
import {
  CalendarCheck,
  ClipboardCheck,
  Calendar,
  Library,
  Flame,
  Hash,
  Search,
  LayoutTemplate,
} from 'lucide-react';

export const navSections = [
  {
    label: 'Journal',
    items: [
      { id: '/today', label: 'Today', to: '/today', Icon: CalendarCheck, description: 'Daily log' },
      { id: '/review', label: 'Review', to: '/review', Icon: ClipboardCheck, description: 'End of day' },
      { id: '/plan', label: 'Plan', to: '/plan', Icon: Calendar, description: 'Upcoming' },
      { id: '/tags', label: 'Tags', to: '/tags', Icon: Hash, description: 'Browse tags' },
    ],
  },
  {
    label: 'Library',
    items: [
      { id: '/collections', label: 'Collections', to: '/collections', Icon: Library, description: 'Lists outside the log' },
      { id: '/habits', label: 'Habits', to: '/habits', Icon: Flame, description: 'Kept, day by day' },
      { id: '/search', label: 'Search', to: '/search', Icon: Search, description: 'Find anything' },
      { id: '/templates', label: 'Templates', to: '/templates', Icon: LayoutTemplate, description: 'Reusable tasks' },
    ],
  },
];

/** Routes that have a page title but deliberately no nav row. */
const extraTitles = {
  '/settings': 'Settings',
};

const navItems = navSections.flatMap((section) => section.items);

/**
 * The nav row that owns a pathname. Everything matches its own subtree
 * (`/plan/weekly` still lights up Plan, `/collections/42` still lights up
 * Collections), matched longest-id-first so no accidental prefix collisions.
 */
export function activeNavId(pathname) {
  const match = navItems
    .filter((item) => pathname === item.id || pathname.startsWith(`${item.id}/`))
    .sort((a, b) => b.id.length - a.id.length)[0];
  return match?.id;
}

/** Top bar title: the current page's name, or "BuJoGeek" when nothing matches. */
export function pageTitle(pathname) {
  const extra = Object.keys(extraTitles)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (extra) return extraTitles[extra];

  const id = activeNavId(pathname);
  const item = navItems.find((entry) => entry.id === id);
  return item?.label ?? 'BuJoGeek';
}
