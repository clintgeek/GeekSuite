/**
 * FitnessGeek navigation config — one source of truth for the sidebar
 * sections, the top bar's page title, and the mobile bottom-nav items.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants grouped nav in the
 * sidebar, a real page title in the top bar, and a bottom tab bar that never
 * duplicates the drawer's account/settings rows. All three surfaces are
 * derived from the same list so a new route can never appear in one surface
 * and not the others.
 */
import HomeIcon from '@mui/icons-material/Home';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import PersonIcon from '@mui/icons-material/Person';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MedicationIcon from '@mui/icons-material/Medication';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SearchIcon from '@mui/icons-material/Search';
import LocalDiningIcon from '@mui/icons-material/LocalDining';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import CalculateIcon from '@mui/icons-material/Calculate';
import InsightsIcon from '@mui/icons-material/Insights';

export const APP_NAME = 'fitnessgeek';

/**
 * Four sections, grouped by what the member is doing:
 *   TRACK    — daily logging and the personal profile it belongs to
 *   HEALTH   — vitals and clinical tracking
 *   TOOLS    — food lookup and planning
 *   INSIGHTS — reports over everything above
 *
 * `/profile` is a real routed page (src/pages/Profile.jsx) that previously
 * had no drawer entry — the avatar only ever deep-linked to /settings. It's
 * added here so every route in the app is reachable from the sidebar.
 */
export const navSections = [
  {
    label: 'TRACK',
    items: [
      { id: '/dashboard', label: 'Dashboard', to: '/dashboard', icon: <HomeIcon sx={{ fontSize: 18 }} /> },
      { id: '/food-log', label: 'Food Log', to: '/food-log', icon: <RestaurantIcon sx={{ fontSize: 18 }} /> },
      { id: '/weight', label: 'Weight', to: '/weight', icon: <MonitorWeightIcon sx={{ fontSize: 18 }} /> },
      { id: '/profile', label: 'Profile', to: '/profile', icon: <PersonIcon sx={{ fontSize: 18 }} /> },
    ],
  },
  {
    label: 'HEALTH',
    items: [
      { id: '/blood-pressure', label: 'Blood Pressure', to: '/blood-pressure', icon: <MonitorHeartIcon sx={{ fontSize: 18 }} /> },
      { id: '/medications', label: 'Medications', to: '/medications', icon: <MedicationIcon sx={{ fontSize: 18 }} /> },
      { id: '/activity', label: 'Activity', to: '/activity', icon: <FitnessCenterIcon sx={{ fontSize: 18 }} /> },
      { id: '/health', label: 'Health Dashboard', to: '/health', icon: <TrendingUpIcon sx={{ fontSize: 18 }} /> },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { id: '/food-search', label: 'Food Search', to: '/food-search', icon: <SearchIcon sx={{ fontSize: 18 }} /> },
      { id: '/my-foods', label: 'My Foods', to: '/my-foods', icon: <LocalDiningIcon sx={{ fontSize: 18 }} /> },
      { id: '/my-meals', label: 'My Meals', to: '/my-meals', icon: <RestaurantMenuIcon sx={{ fontSize: 18 }} /> },
      { id: '/calorie-wizard', label: 'Calorie Wizard', to: '/calorie-wizard', icon: <CalculateIcon sx={{ fontSize: 18 }} /> },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: '/reports', label: 'Reports', to: '/reports', icon: <InsightsIcon sx={{ fontSize: 18 }} /> },
    ],
  },
];

/** Routes that have a page title but deliberately no nav row. */
const extraTitles = {
  '/settings': 'Settings',
};

const navItems = navSections.flatMap((section) => section.items);

/**
 * The nav row that owns a pathname. Longest matching `id` wins so nested
 * routes (e.g. a future `/weight/history`) still light up their parent row.
 */
export function activeNavId(pathname) {
  const match = navItems
    .filter((item) => pathname === item.id || pathname.startsWith(`${item.id}/`))
    .sort((a, b) => b.id.length - a.id.length)[0];
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
  return item?.label ?? APP_NAME;
}

/**
 * Mobile bottom tab bar — data-entry app, so it's in scope for `GeekBottomNav`
 * (max 5 items, never Logout/Settings). Icons intentionally mirror the
 * sidebar rows for the same routes (Food Log → Restaurant, Activity →
 * FitnessCenter, Profile → Person) so the two surfaces read as one system.
 */
export const bottomNavItems = [
  { id: '/dashboard', label: 'Home', to: '/dashboard', icon: <HomeIcon sx={{ fontSize: 22 }} /> },
  { id: '/food-log', label: 'Log', to: '/food-log', icon: <RestaurantIcon sx={{ fontSize: 22 }} /> },
  { id: '/activity', label: 'Activity', to: '/activity', icon: <FitnessCenterIcon sx={{ fontSize: 22 }} /> },
  { id: '/profile', label: 'Profile', to: '/profile', icon: <PersonIcon sx={{ fontSize: 22 }} /> },
];
