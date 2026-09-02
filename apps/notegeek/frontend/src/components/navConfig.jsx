/**
 * NoteGeek navigation config — one source of truth for the sidebar's primary
 * row, the top bar's page title, and the active-id matching both surfaces
 * use to highlight the current route.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants a real page title
 * in the top bar and consistent active-state matching in the sidebar and its
 * footer. Deriving both from the same list means a new route can't appear in
 * one surface and not the other.
 */
import AddIcon from '@mui/icons-material/Add';
import HomeIcon from '@mui/icons-material/HomeOutlined';
import SearchIcon from '@mui/icons-material/Search';

/**
 * "New Note" is an action, not a destination you land on and stay
 * highlighted against — it is deliberately left out of `navSections` (and
 * therefore out of `activeNavId`), and styled as a filled primary button via
 * `Sidebar`'s `itemSx` keyed off this id.
 */
export const NEW_NOTE_ITEM = {
  id: 'new-note',
  label: 'New Note',
  to: '/notes/new',
  icon: <AddIcon sx={{ fontSize: 17 }} />,
};

/** The sidebar's primary section, sans "New Note" (see above). */
export const navSections = [
  {
    items: [
      {
        id: 'home',
        label: 'Home',
        to: '/',
        icon: <HomeIcon sx={{ fontSize: 17 }} />,
      },
      {
        id: 'search',
        label: 'Search',
        to: '/search',
        icon: <SearchIcon sx={{ fontSize: 17 }} />,
      },
    ],
  },
];

/**
 * Routes with a page title but no nav row of their own — note detail/edit,
 * the new-note editor, and tag views all fall under "Notes" rather than
 * fetching the note's actual title (not needed for a top-bar label).
 */
const extraTitles = {
  '/notes': 'Notes',
  '/tags': 'Notes',
  '/settings': 'Settings',
};

const navItems = navSections.flatMap((section) => section.items);

/**
 * The nav row (or footer row) that owns a pathname. "/" only matches
 * itself; "/settings" resolves to the footer Settings row's id (the sidebar
 * has no router of its own — see `GeekSidebar`'s `footer.settings` docs) so
 * that row highlights instead of nothing highlighting at all.
 */
export function activeNavId(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/settings')) return 'settings';
  const match = navItems
    .filter((item) => item.to !== '/' && pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.id;
}

/** Top bar title: the current page's name, or the app name when nothing matches. */
export function pageTitle(pathname) {
  const extra = Object.keys(extraTitles)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (extra) return extraTitles[extra];

  const id = activeNavId(pathname);
  const item = navItems.find((entry) => entry.id === id);
  return item?.label ?? 'NoteGeek';
}
