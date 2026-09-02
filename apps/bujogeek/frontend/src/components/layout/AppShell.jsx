/**
 * AppShell — BuJoGeek's layout shell, pure suite grammar.
 *
 * The shell owns the breakpoint and the drawer (`nav`), so the bespoke
 * `isMobile` / `mobileOpen` state and the hand-rolled `<Drawer>` that used to
 * live here are gone. The same `Sidebar` panel serves the permanent 220px
 * desktop column and the temporary mobile drawer; its always-dark tobacco
 * chrome is pinned onto the drawer paper via `navSx` (the drawer paper would
 * otherwise follow the app's mode-aware `background.paper`).
 */
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';
import Sidebar, { chrome } from './Sidebar';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';

const AppShell = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const showNavigation = Boolean(user);

  return (
    <GeekShell
      nav={showNavigation ? <Sidebar /> : null}
      navSx={{ bgcolor: chrome.bg }}
      topBar={<TopBar />}
      bottomNav={isMobile && showNavigation ? <MobileTabBar /> : null}
    >
      <GeekAppFrame>{children}</GeekAppFrame>
    </GeekShell>
  );
};

export default AppShell;
