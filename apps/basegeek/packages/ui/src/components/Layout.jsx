/**
 * baseGeek layout — pure suite grammar (THE_UI_UNIFICATION_PLAN.md §3).
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the 388-line
 * bespoke layout this replaced is gone: the collapsing 68px rail and its
 * chevron/hamburger controls, the `SIDEBAR_COLLAPSED` constant, the
 * mobile-only AppBar with its wordmark, the hand-rolled temporary and
 * permanent Drawers, and the `isMobile` / `mobileOpen` / `collapsed` state
 * that drove all of it. The same 220px `Sidebar` panel now serves desktop and
 * mobile, and `GeekAppFrame` owns the route fade the `.fade-in` class used to.
 *
 * Public routes (Portal, Login, Register) render outside this shell and are
 * untouched.
 */
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout() {
  return (
    <GeekShell
      nav={<Sidebar />}
      navSx={{ bgcolor: 'background.default' }}
      topBar={<TopBar />}
    >
      <GeekAppFrame>
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
          <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
            <Outlet />
          </Box>
        </Box>
      </GeekAppFrame>
    </GeekShell>
  );
}
