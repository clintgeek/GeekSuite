/**
 * StoryGeek navigation config — one source of truth for the sidebar sections
 * and the top bar's page title.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants grouped nav in the
 * sidebar and a real page title in the top bar. Both are derived from the same
 * list here so a route can never appear in one surface and not the other.
 *
 * StoryGeek's wrinkle: "Characters" is only reachable while you are inside a
 * tale, and its path carries that tale's id. So `navSectionsFor` takes the
 * pathname rather than being a constant, and the codex row lands in its own
 * "This Tale" section instead of floating in the main list.
 */
import BookIcon from '@mui/icons-material/Book';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';

/** The story id embedded in /play/:id and /characters/:id, or null. */
export function storyIdFrom(pathname) {
  return pathname.match(/^\/(?:play|characters)\/([^/]+)/)?.[1] ?? null;
}

/**
 * Sidebar sections. "Chapters" carries the overline the old drawer had; the
 * second section only exists while a tale is open.
 */
export function navSectionsFor(pathname) {
  const sections = [
    {
      label: 'Chapters',
      items: [
        { id: '/', label: 'Your Tales', to: '/', icon: <BookIcon /> },
        { id: '/create', label: 'Begin a Tale', to: '/create', icon: <AddIcon /> },
      ],
    },
  ];

  const storyId = storyIdFrom(pathname);
  if (storyId) {
    sections.push({
      label: 'This Tale',
      items: [
        {
          id: '/characters',
          label: 'Characters',
          to: `/characters/${storyId}`,
          icon: <PeopleIcon />,
        },
      ],
    });
  }

  return sections;
}

/**
 * The row that owns a pathname. `/play/:id` deliberately lights up nothing —
 * the tale is the working surface, not a nav destination. `'settings'` is the
 * id `GeekSidebar` uses for its footer Settings row.
 */
export function activeNavId(pathname) {
  if (pathname === '/') return '/';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/create')) return '/create';
  if (pathname.startsWith('/characters')) return '/characters';
  return undefined;
}

/**
 * Top bar title. The tale's own name is not available here — StoryPlay loads
 * the story over REST into its own state, so there is no shared cache to read
 * from — and StoryPlay already prints the title above the scene, so the bar
 * says "Story" rather than duplicating a fetch.
 */
export function pageTitle(pathname) {
  if (pathname.startsWith('/characters')) return 'Character Codex';
  if (pathname.startsWith('/play')) return 'Story';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/create')) return 'New Adventure';
  if (pathname === '/') return 'Your Library';
  return 'StoryGeek';
}
