import { Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery, useTheme } from '@mui/material';
import { GeekShell, GeekAppFrame, GeekBottomNav, GeekFab, geekLayout } from '@geeksuite/ui';
import { activeNavId, bottomNavItems } from './navConfig.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import {
  PrimaryActionContext,
  usePrimaryAction,
  usePrimaryActionState,
} from './primaryAction.js';

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
 * The `GeekFab` is mounted here, as a *sibling* of `GeekAppFrame`, because the
 * frame's route transition is a motion element and would fade a fixed child
 * with the page. Which action it carries is the page's call — see
 * `primaryAction.jsx`. No page registered → no FAB.
 */
function ModernLayoutShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const location = useLocation();
  const primaryAction = usePrimaryAction();

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
      {primaryAction ? (
        <GeekFab
          label={primaryAction.label}
          icon={primaryAction.icon}
          showOn={primaryAction.showOn}
          onClick={primaryAction.onClick}
        />
      ) : null}
    </GeekShell>
  );
}

export default function ModernLayout() {
  const primaryActionState = usePrimaryActionState();

  return (
    <PrimaryActionContext.Provider value={primaryActionState}>
      <ModernLayoutShell />
    </PrimaryActionContext.Provider>
  );
}
