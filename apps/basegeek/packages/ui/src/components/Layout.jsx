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
 *
 * `GeekToastProvider` sits *inside* `GeekShell` and *outside* `GeekAppFrame`,
 * which is the only placement that works: the provider reads `useGeekShell()`
 * to offset toasts past the permanent nav panel and above any `bottomInset`,
 * so it has to be under the shell — but `GeekAppFrame` owns the route
 * transition and remounts on navigation, and a provider inside it would take
 * the toast stack down with every route change, including the "saved" that
 * triggered the navigation.
 */
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { GeekShell, GeekAppFrame, GeekToastProvider } from '@geeksuite/ui';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout() {
  return (
    <GeekShell
      nav={<Sidebar />}
      navSx={{ bgcolor: 'background.default' }}
      topBar={<TopBar />}
    >
      <GeekToastProvider>
        <GeekAppFrame>
          <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
            <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
              <Outlet />
            </Box>
          </Box>
        </GeekAppFrame>
      </GeekToastProvider>
    </GeekShell>
  );
}
