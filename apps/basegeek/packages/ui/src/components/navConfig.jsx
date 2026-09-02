/**
 * baseGeek navigation config — one source of truth for the sidebar sections
 * and the top bar's page title.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants grouped nav in the
 * sidebar and a real page title in the top bar. Both are derived from the same
 * list, so a route can never appear on one surface and be missing from the
 * other.
 *
 * Account and Settings deliberately have NO nav row: per the grammar they live
 * in the sidebar footer (user chip / Settings) and the top bar account menu.
 * They still need titles, hence `chromeTitles`.
 */
import HomeIcon from '@mui/icons-material/Home';
import StorageIcon from '@mui/icons-material/Storage';
import PeopleIcon from '@mui/icons-material/People';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import KeyIcon from '@mui/icons-material/Key';

/**
 * Three sections, grouped by what the operator is doing:
 *   Overview — the control room itself
 *   Services — the shared backends baseGeek fronts
 *   Access   — the credentials that reach them
 */
export const navSections = [
  {
    label: 'Overview',
    items: [
      // `title` overrides the top bar label: the row reads "Home" next to the
      // brand, but the page it opens is the mission control dashboard.
      { id: '/', label: 'Home', title: 'Mission Control', to: '/', icon: <HomeIcon /> },
    ],
  },
  {
    label: 'Services',
    items: [
      { id: '/datageek', label: 'DataGeek', to: '/datageek', icon: <StorageIcon /> },
      { id: '/usergeek', label: 'UserGeek', to: '/usergeek', icon: <PeopleIcon /> },
      { id: '/aigeek', label: 'AIGeek', to: '/aigeek', icon: <SmartToyIcon /> },
    ],
  },
  {
    label: 'Access',
    items: [
      { id: '/api-keys', label: 'API Keys', to: '/api-keys', icon: <KeyIcon /> },
    ],
  },
];

/** Routes reachable only from the chrome (footer chip / Settings row / menu). */
const chromeTitles = {
  '/account': 'Account',
  '/settings': 'Settings',
};

const navItems = navSections.flatMap((section) => section.items);

/** Every id that can own a pathname, nav rows plus the chrome routes. */
const matchableIds = [...navItems.map((item) => item.id), ...Object.keys(chromeTitles)];

/**
 * The id that owns a pathname. "/" only matches itself; everything else matches
 * its own subtree, so /datageek/mongo still lights up DataGeek. Returning
 * '/settings' here is what makes `GeekSidebar`'s footer Settings row selected —
 * the primitive has no router and compares `activeId` to `settings.to`.
 */
export function activeNavId(pathname) {
  if (pathname === '/') return '/';
  return matchableIds
    .filter((id) => id !== '/' && (pathname === id || pathname.startsWith(`${id}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

/** Top bar title: the current page's name, or the app name when nothing matches. */
export function pageTitle(pathname) {
  const id = activeNavId(pathname);
  if (!id) return 'baseGeek';
  if (chromeTitles[id]) return chromeTitles[id];
  const item = navItems.find((entry) => entry.id === id);
  return item?.title ?? item?.label ?? 'baseGeek';
}
