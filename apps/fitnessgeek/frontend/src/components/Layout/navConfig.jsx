/**
 * FitnessGeek navigation config — one source of truth for the sidebar rows,
 * the top bar's page title, the mobile bottom-nav items, and the More page
 * (DOCS/ONE_APP_PLAN.md §3, "Fewer places").
 *
 * There is one app and one navigation, the same for everybody:
 *
 *   - Sidebar (desktop, and the phone's drawer): Today · Weight · Blood
 *     pressure · Medications · Trends · Saved foods. Settings is in the
 *     account menu.
 *   - Phone tabs: Today · Weight · Trends · More.
 *   - More: Blood pressure, Medications, Saved foods, Calorie plan, Import a
 *     scan, Settings.
 *
 * Home and Food log are one page, Today. Reports, Activity and the Health
 * dashboard are the tabs of Trends; My meals and My foods are the tabs of
 * Saved foods. Their old addresses redirect (App.jsx), so nothing a link or
 * an installed shortcut points at is gone. "Look up a specific food" lives in
 * the add sheet; /food-search keeps its route and its title, with no row.
 * Calorie plan is also reached from the target on Today and from Settings;
 * Import a scan from the Weight page and from Settings.
 */
import TodayIcon from '@mui/icons-material/TodayOutlined';
import MonitorWeightIcon from '@mui/icons-material/MonitorWeightOutlined';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeartOutlined';
import MedicationIcon from '@mui/icons-material/MedicationOutlined';
import MenuBookIcon from '@mui/icons-material/MenuBookOutlined';
import CalculateIcon from '@mui/icons-material/CalculateOutlined';
import InsightsIcon from '@mui/icons-material/InsightsOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHorizOutlined';

export const APP_NAME = 'fitnessgeek';

// One outlined icon set (visual review B7).
const icon = (Icon, size = 20) => <Icon sx={{ fontSize: size }} />;

/** Every destination with a row somewhere, once. */
export const DESTINATIONS = {
  today: { id: '/dashboard', label: 'Today', to: '/dashboard', Icon: TodayIcon },
  weight: { id: '/weight', label: 'Weight', to: '/weight', Icon: MonitorWeightIcon, description: 'Log your weight and see the trend' },
  bp: { id: '/blood-pressure', label: 'Blood pressure', to: '/blood-pressure', Icon: MonitorHeartIcon, description: 'Log a reading' },
  meds: { id: '/medications', label: 'Medications', to: '/medications', Icon: MedicationIcon, description: 'Your meds, and today’s doses' },
  trends: { id: '/trends', label: 'Trends', to: '/trends', Icon: InsightsIcon, description: 'Food, activity and health over time' },
  saved: { id: '/saved-foods', label: 'Saved foods', to: '/saved-foods', Icon: MenuBookIcon, description: 'Meals and foods you saved' },
  wizard: { id: '/calorie-wizard', label: 'Calorie plan', to: '/calorie-wizard', Icon: CalculateIcon, description: 'Work out a daily calorie target' },
  scan: { id: '/scan-import', label: 'Import a scan', to: '/scan-import', Icon: UploadFileIcon, description: 'Body-composition scans from the scale' },
  settings: { id: '/settings', label: 'Settings', to: '/settings', Icon: SettingsIcon, description: 'Larger text, theme, your details and more' },
};

// The More row: a place of its own.
const MORE = { id: '/more', label: 'More', to: '/more', Icon: MoreHorizIcon };

const row = (d) => ({ id: d.id, label: d.label, to: d.to, icon: icon(d.Icon) });

/** The sidebar: six rows, no headings to learn. */
export function navSectionsFor() {
  const D = DESTINATIONS;
  return [
    { items: [D.today, D.weight, D.bp, D.meds, D.trends, D.saved].map(row) },
  ];
}

export const navSections = navSectionsFor();

/** The More page: everything the phone's tabs don't hold, in one list. */
export function moreGroupsFor() {
  const D = DESTINATIONS;
  return [
    { label: 'More', items: [D.bp, D.meds, D.saved, D.wizard, D.scan, D.settings] },
  ];
}

/** Routes that have a page title but deliberately no nav row. */
const extraTitles = {
  '/more': 'More',
  '/food-search': 'Look up a specific food',
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
 * Top bar title: the current page's name, the same word as its row or tab,
 * or the app name when nothing matches.
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

const TAB_IDS = ['/dashboard', '/weight', '/trends'];

/**
 * The bottom tab bar's active tab. Anything reached through More lights More,
 * so the bar always says where you are.
 */
export function bottomNavActiveId(pathname) {
  const id = activeNavId(pathname);
  return TAB_IDS.includes(id) ? id : '/more';
}

/**
 * Mobile bottom tab bar — Today · Weight · Trends · More. Never
 * Logout/Settings; Settings lives under More.
 */
export const bottomNavItems = [
  { id: '/dashboard', label: 'Today', to: '/dashboard', icon: icon(TodayIcon, 24) },
  { id: '/weight', label: 'Weight', to: '/weight', icon: icon(MonitorWeightIcon, 24) },
  { id: '/trends', label: 'Trends', to: '/trends', icon: icon(InsightsIcon, 24) },
  { id: '/more', label: 'More', to: '/more', icon: icon(MoreHorizIcon, 24) },
];
