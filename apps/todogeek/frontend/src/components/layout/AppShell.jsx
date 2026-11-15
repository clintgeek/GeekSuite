/**
 * AppShell — TodoGeek's layout shell, suite grammar (`GeekShell`: sidebar /
 * drawer, top bar, the phone's tab bar).
 *
 * The content frame is TodoGeek's own rather than `GeekAppFrame`: the frame
 * fades every route in, and Red Pen allows exactly one animation, the strike
 * (DOCS/SIMPLE_PLAN.md § Identity item 3). The frame is otherwise the same —
 * the scrolling <main>, the page ground, room for the tab bar.
 *
 * `GeekToastProvider` stays inside `GeekShell` (so it reads the shell's
 * insets and clears the sidebar and tab bar).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekToastProvider, useGeekShell } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import { chromeFor } from '../../theme/chrome';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';
import { scrollMainToTop } from './scrollTop';

export function PenFrame({ children }) {
  const { bottomInset } = useGeekShell();
  const { pathname } = useLocation();
  const first = useRef(true);
  // Each tab opens at its top: the scroll position used to carry from one
  // view to the next (3.20). Tapping the ACTIVE tab does it too (MobileTabBar).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    scrollMainToTop();
  }, [pathname]);
  return (
    <Box
      component="main"
      data-pen-frame
      sx={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor: 'background.default',
        ...(bottomInset ? { pb: `${bottomInset}px` } : null),
      }}
    >
      {children}
    </Box>
  );
}

const AppShell = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const showNavigation = Boolean(user);

  return (
    <GeekShell
      nav={showNavigation ? <Sidebar /> : null}
      navSx={{ bgcolor: chromeFor(theme.palette.mode).bg }}
      topBar={<TopBar />}
      bottomNav={isMobile && showNavigation ? <MobileTabBar /> : null}
    >
      <GeekToastProvider>
        <PenFrame>{children}</PenFrame>
      </GeekToastProvider>
    </GeekShell>
  );
};

export default AppShell;
