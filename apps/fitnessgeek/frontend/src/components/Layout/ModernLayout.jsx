import { Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery, useTheme } from '@mui/material';
import { GeekShell, GeekAppFrame, GeekBottomNav, geekLayout } from '@geeksuite/ui';
import { activeNavId, bottomNavItems } from './navConfig.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * FitnessGeek layout — suite shell grammar (TODO_ORDER #15a) plus the mobile
 * grammar's thumb-zone action (MOBILE_UI_PLAN.md §2, §4).
 *
 * The shell owns the breakpoint and the mobile drawer (`nav`), so the
 * hand-rolled avatar-anchored nav Menu that used to stand in for mobile
 * navigation is gone, along with the `mobileMenuAnchor` state that drove it.
 * The same `Sidebar` panel serves desktop and mobile.
 *
 * FitnessGeek is a data-entry app, so it keeps its mobile bottom tab bar via
 * `GeekBottomNav`; `GeekShell bottomNav` reserves the space and
 * `GeekAppFrame` insets the content automatically, so the old hardcoded
 * `pb: '88px'` is gone too.
 *
 * The thumb-zone FAB is the shell's job now: a page calls the suite's
 * `useGeekPrimaryAction({ label, icon, onClick })` and `GeekShell` mounts the
 * `GeekFab` as a sibling of `GeekAppFrame` (the frame's route transition is a
 * motion element and would capture a fixed child). The 75-line registry this
 * app used to carry moved into `packages/ui` — MOBILE_UI_PLAN.md §4b — so
 * there is no provider to wrap here any more. No page registered → no FAB.
 */
export default function ModernLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const location = useLocation();

  return (
    <GeekShell
      // Studio Slate's sidebar is always-dark; pin the mobile drawer paper too.
      navSx={{ bgcolor: '#0C0A09' }}
      nav={<Sidebar />}
      topBar={<TopBar />}
      bottomNav={
        isMobile ? (
          <GeekBottomNav
            items={bottomNavItems}
            activeId={activeNavId(location.pathname)}
          />
        ) : null
      }
    >
      <GeekAppFrame>
        <Outlet />
      </GeekAppFrame>
    </GeekShell>
  );
}
