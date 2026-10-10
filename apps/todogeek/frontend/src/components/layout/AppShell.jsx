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
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekToastProvider, useGeekShell } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import { chromeFor } from '../../theme/chrome';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';

function PenFrame({ children }) {
  const { bottomInset } = useGeekShell();
  return (
    <Box
      component="main"
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
