import { Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery, useTheme } from '@mui/material';
import { GeekShell, GeekAppFrame, GeekBottomNav, geekLayout } from '@geeksuite/ui';
import { activeNavId, bottomNavItems } from './navConfig.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * FitnessGeek layout — suite shell grammar (TODO_ORDER #15a).
 *
 * The shell now owns the breakpoint and the mobile drawer (`nav`), so the
 * hand-rolled avatar-anchored nav Menu that used to stand in for mobile
 * navigation is gone, along with the `mobileMenuAnchor` state that drove it.
 * The same `Sidebar` panel serves desktop and mobile.
 *
 * FitnessGeek is a data-entry app, so it keeps its mobile bottom tab bar via
 * `GeekBottomNav`; `GeekShell bottomNav` reserves the space and
 * `GeekAppFrame` insets the content automatically, so the old hardcoded
 * `pb: '88px'` is gone too.
 */
export default function ModernLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const location = useLocation();

  return (
    <GeekShell
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
