/**
 * FitnessGeek navigation config — one source of truth for the sidebar
 * sections, the top bar's page title, the mobile bottom-nav items, and the
 * More page.
 *
 * DOCS/SIMPLE_AND_FULL_PLAN.md item 6: the check-ins are PLACES, not buttons
 * on Home. The bottom bar is Home · Log · Weight · More, and everything that
 * used to hold a slot (Activity, Profile) moved under More. Nothing is
 * removed: every route in App.jsx is reachable from the More page and, on a
 * desktop, from the sidebar. (Profile folded into Settings, 2026-10-17;
 * /profile redirects there, so it has no row of its own.)
 *
 * Simple mode (the face designed around Heather) shows the same four tabs and
 * a shorter More page — the Weight / BP / Meds check-ins first, then the rest
 * behind a plain "Everything else" heading, ordered by what she uses and
 * saying what each page needs before it shows anything (review IA-9). Full
 * mode lists it all.
 */
import HomeIcon from '@mui/icons-material/Home';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeight';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MedicationIcon from '@mui/icons-material/Medication';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SearchIcon from '@mui/icons-material/Search';
import LocalDiningIcon from '@mui/icons-material/LocalDining';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import CalculateIcon from '@mui/icons-material/Calculate';
import InsightsIcon from '@mui/icons-material/Insights';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SettingsIcon from '@mui/icons-material/Settings';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

export const APP_NAME = 'fitnessgeek';

const icon = (Icon, size = 20) => <Icon sx={{ fontSize: size }} />;

/**
 * Every destination, once. `simple: true` marks the ones Simple mode keeps in
 * front; the rest are still there, one heading down. `simpleDescription` is
 * Simple's line where it needs to say what a page depends on — a Garmin
 * watch, the smart scale — so a dead end says so before she taps it.
 */
export const DESTINATIONS = {
  home: { id: '/dashboard', label: 'Home', to: '/dashboard', Icon: HomeIcon, simple: true },
  log: { id: '/food-log', label: 'Food log', to: '/food-log', Icon: RestaurantIcon, simple: true },
  weight: { id: '/weight', label: 'Weight', to: '/weight', Icon: MonitorWeightIcon, simple: true, description: 'Log your weight and see the trend' },
  bp: { id: '/blood-pressure', label: 'Blood pressure', to: '/blood-pressure', Icon: MonitorHeartIcon, simple: true, description: 'Log a reading' },
  meds: { id: '/medications', label: 'Medications', to: '/medications', Icon: MedicationIcon, simple: true, description: 'Your meds, and today’s doses' },
  activity: { id: '/activity', label: 'Activity', to: '/activity', Icon: FitnessCenterIcon, description: 'Steps, workouts and sleep from Garmin', simpleDescription: 'Steps and sleep — needs a Garmin watch' },
  health: { id: '/health', label: 'Health dashboard', to: '/health', Icon: TrendingUpIcon, description: 'Heart rate, stress and recovery', simpleDescription: 'Live heart rate and stress — needs setup' },
  reports: { id: '/reports', label: 'Reports', to: '/reports', Icon: InsightsIcon, description: 'How the week and the month went' },
  scan: { id: '/scan-import', label: 'Import a scan', to: '/scan-import', Icon: UploadFileIcon, description: 'Body-composition scans from the scale', simpleDescription: 'Body-composition scans — needs the smart scale' },
  search: { id: '/food-search', label: 'Look up a specific food', to: '/food-search', Icon: SearchIcon, description: 'Pick one exact food or brand from every database' },
  myFoods: { id: '/my-foods', label: 'My foods', to: '/my-foods', Icon: LocalDiningIcon, description: 'Foods you made yourself' },
  myMeals: { id: '/my-meals', label: 'My meals', to: '/my-meals', Icon: RestaurantMenuIcon, description: 'Meals you saved to log in one tap' },
  wizard: { id: '/calorie-wizard', label: 'Calorie plan', to: '/calorie-wizard', Icon: CalculateIcon, description: 'Work out a daily calorie target' },
  settings: { id: '/settings', label: 'Settings', to: '/settings', Icon: SettingsIcon, simple: true, description: 'Simple or Full, larger text, and more' },
};

// The More row: a place of its own, not a Home row with its fields swapped.
const MORE = { id: '/more', label: 'More', to: '/more', Icon: MoreHorizIcon };

const row = (d) => ({ id: d.id, label: d.label, to: d.to, icon: icon(d.Icon) });

/** Sidebar sections. Plain words, no ALL-CAPS jargon. */
export function navSectionsFor(mode = 'full') {
  const D = DESTINATIONS;
  if (mode === 'simple') {
    return [
      { label: 'Today', items: [D.home, D.log].map(row) },
      { label: 'Check-ins', items: [D.weight, D.bp, D.meds].map(row) },
      { label: 'Everything else', items: [row(MORE)] },
    ];
  }
  return [
    { label: 'Today', items: [D.home, D.log].map(row) },
    { label: 'Check-ins', items: [D.weight, D.bp, D.meds].map(row) },
    { label: 'Food', items: [D.search, D.myFoods, D.myMeals, D.wizard].map(row) },
    { label: 'Body and activity', items: [D.activity, D.health, D.scan].map(row) },
    { label: 'Looking back', items: [D.reports].map(row) },
  ];
}

// The Full list is the superset; kept as a named export for older imports.
export const navSections = navSectionsFor('full');

/** The More page: groups of destinations, per mode. */
export function moreGroupsFor(mode = 'full') {
  const D = DESTINATIONS;
  const checkIns = { label: 'Check-ins', items: [D.bp, D.meds] };
  const food = { label: 'Food', items: [D.search, D.myMeals, D.myFoods, D.wizard] };
  const body = { label: 'Body and activity', items: [D.activity, D.health, D.scan] };
  const back = { label: 'Looking back', items: [D.reports] };
  const you = { label: 'You', items: [D.settings] };
  if (mode === 'simple') {
    // Hers first (My meals, My foods, a specific food, Reports), then the
    // pages that need something she may not have, each saying what.
    const simple = (d) => (d.simpleDescription ? { ...d, description: d.simpleDescription } : d);
    return [
      checkIns,
      you,
      { label: 'Everything else', items: [D.myMeals, D.myFoods, D.search, D.reports, D.wizard, D.activity, D.health, D.scan].map(simple) },
    ];
  }
  return [checkIns, food, body, back, you];
}

/** Routes that have a page title but deliberately no nav row. */
const extraTitles = {
  '/settings': 'Settings',
  '/more': 'More',
};

const allItems = Object.values(DESTINATIONS);

/**
 * The nav row that owns a pathname. Longest matching `id` wins so nested
 * routes (e.g. a future `/weight/history`) still light up their parent row.
 */
export function activeNavId(pathname) {
  const match = [...allItems, MORE]
    .filter((item) => pathname === item.id || pathname.startsWith(`${item.id}/`))
    .sort((a, b) => b.id.length - a.id.length)[0];
  return match?.id;
}

/**
 * Top bar title: the current page's name, or the app name when nothing
 * matches. Home is "Home", the same as its tab (review IA-8); the greeting
 * under it already says the day.
 */
export function pageTitle(pathname) {
  const extra = Object.keys(extraTitles)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (extra) return extraTitles[extra];

  const id = activeNavId(pathname);
  const item = allItems.find((entry) => entry.id === id);
  return item?.label ?? APP_NAME;
}

/**
 * The bottom tab bar's active tab. Anything reached through More lights More,
 * so the bar always says where you are.
 */
export function bottomNavActiveId(pathname) {
  const id = activeNavId(pathname);
  if (['/dashboard', '/food-log', '/weight'].includes(id)) return id;
  return '/more';
}

/**
 * Mobile bottom tab bar — Home · Log · Weight · More (plan item 6). Max five
 * items, never Logout/Settings; Settings lives under More.
 */
export const bottomNavItems = [
  { id: '/dashboard', label: 'Home', to: '/dashboard', icon: icon(HomeIcon, 24) },
  { id: '/food-log', label: 'Log', to: '/food-log', icon: icon(RestaurantIcon, 24) },
  { id: '/weight', label: 'Weight', to: '/weight', icon: icon(MonitorWeightIcon, 24) },
  { id: '/more', label: 'More', to: '/more', icon: icon(MoreHorizIcon, 24) },
];
