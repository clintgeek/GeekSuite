/**
 * FlockGeek navigation config — one source of truth for the sidebar sections
 * and the top bar's page title.
 *
 * The suite grammar (THE_UI_UNIFICATION_PLAN.md §3) wants grouped nav in the
 * sidebar and a real page title in the top bar. Both are derived from the same
 * list so a new route can never appear in one surface and not the other.
 */
import HomeIcon from "@mui/icons-material/HomeOutlined";
import EggIcon from "@mui/icons-material/EggOutlined";
import PetsIcon from "@mui/icons-material/PetsOutlined";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";
import PlaceIcon from "@mui/icons-material/PlaceOutlined";
import FavoriteIcon from "@mui/icons-material/FavoriteBorderOutlined";
import HatchIcon from "@mui/icons-material/TrackChangesOutlined";
import { APP_NAME } from "../utils/constants";

/**
 * Three sections, grouped by what the caretaker is doing:
 *   Flock   — the living birds and how they are organised
 *   Records — the logs kept about them
 *   Setup   — the standing configuration those records are filed against
 */
export const navSections = [
  {
    label: "Flock",
    items: [
      { id: "/", label: "Home", to: "/", icon: <HomeIcon /> },
      { id: "/birds", label: "Birds", to: "/birds", icon: <PetsIcon /> },
      { id: "/groups", label: "Groups", to: "/groups", icon: <GroupsIcon /> }
    ]
  },
  {
    label: "Records",
    items: [
      { id: "/egg-log", label: "Egg Log", to: "/egg-log", icon: <EggIcon /> },
      { id: "/hatch-log", label: "Hatch Log", to: "/hatch-log", icon: <HatchIcon /> }
    ]
  },
  {
    label: "Setup",
    items: [
      { id: "/locations", label: "Locations", to: "/locations", icon: <PlaceIcon /> },
      { id: "/pairings", label: "Pairings", to: "/pairings", icon: <FavoriteIcon /> }
    ]
  }
];

/** Routes that have a page title but deliberately no nav row. */
const extraTitles = {
  "/dashboard": "Dashboard",
  "/settings": "Settings"
};

const navItems = navSections.flatMap((section) => section.items);

/**
 * The nav row that owns a pathname. "/" only matches itself; everything else
 * matches its own subtree, so /birds/42 still lights up Birds.
 */
export function activeNavId(pathname) {
  if (pathname === "/") return "/";
  const match = navItems
    .filter((item) => item.id !== "/" && pathname.startsWith(item.id))
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
