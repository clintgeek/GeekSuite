/**
 * useGeekNavSlots — one items array in, the right navigation out (plan 2.6,
 * tablet baseline "Fix first" 1).
 *
 * The device picks the surface (`useGeekNavMode()`): the bottom bar on a
 * phone, the rail on a tablet (600–1199 px with a mouse; any touch tablet,
 * portrait 800 and landscape 1280 alike), the sidebar on a desktop. The app
 * passes ONE list and spreads the result into `GeekShell`:
 *
 *   const items = [
 *     { id: 'today', label: 'Today', icon: <TodayIcon />, to: '/today' },
 *     { id: 'upcoming', label: 'Upcoming', icon: <EventIcon />, to: '/upcoming' },
 *   ];
 *   const { navMode, ...slots } = useGeekNavSlots({ items, activeId });
 *   return <GeekShell {...slots} topBar={<GeekTopBar … />}>{page}</GeekShell>;
 *
 * Returns `{ navMode, nav, rail, bottomNav }` — exactly one of the three
 * slots is set (plus `nav` on a phone with `phoneDrawer`). `GeekShell`
 * ignores `navMode`, so spreading the whole object also works.
 *
 *   - `sidebar`: a ready sidebar element (an app's own panel with a tag tree,
 *     say) used instead of `<GeekSidebar items … {...sidebarProps} />`;
 *   - `sidebarProps` / `railProps` / `bottomNavProps`: passed to that surface
 *     (brand, footer, header, labelSx…), so each keeps the app's look;
 *   - `phoneDrawer`: also give the phone the sidebar as a hamburger drawer
 *     (TodoGeek and NoteGeek do this today) — default off;
 *   - `hidden`: no navigation at all (a full-screen editor);
 *   - `navMode`: force a mode (tests, an app with its own rule).
 *
 * The bottom bar keeps its own rules: at most five items, no logout.
 */
import { GeekBottomNav } from './GeekBottomNav.jsx';
import { GeekNavRail } from './GeekNavRail.jsx';
import { GeekSidebar } from './GeekSidebar.jsx';
import { useGeekNavMode } from '../hooks/useFormFactor.js';

export function useGeekNavSlots({
  items = [],
  activeId,
  onNavigate,
  sidebar,
  sidebarProps,
  railProps,
  bottomNavProps,
  phoneDrawer = false,
  hidden = false,
  navMode: forcedMode,
} = {}) {
  const detected = useGeekNavMode();
  const navMode = forcedMode ?? detected;

  if (hidden) return { navMode, nav: undefined, rail: undefined, bottomNav: null };

  const sidebarEl =
    sidebar ?? <GeekSidebar items={items} activeId={activeId} onNavigate={onNavigate} {...sidebarProps} />;

  return {
    navMode,
    nav: navMode === 'sidebar' || (navMode === 'bottom' && phoneDrawer) ? sidebarEl : undefined,
    rail:
      navMode === 'rail' ? (
        <GeekNavRail items={items} activeId={activeId} onNavigate={onNavigate} {...railProps} />
      ) : undefined,
    bottomNav:
      navMode === 'bottom' ? (
        <GeekBottomNav items={items} activeId={activeId} onNavigate={onNavigate} {...bottomNavProps} />
      ) : null,
  };
}
