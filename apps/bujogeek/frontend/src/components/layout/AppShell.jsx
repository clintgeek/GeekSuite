/**
 * AppShell — BuJoGeek's layout shell.
 *
 * Structure: GeekShell (shared behavior)
 *            ├─ sidebar slot: <Sidebar /> (bujogeek-specific content)
 *            ├─ topBar slot:  <TopBar />  (bujogeek-specific content)
 *            └─ children:    page content via GeekAppFrame
 *
 * GeekShell owns:    flex layout, focus mode hide/show, data attributes.
 * GeekAppFrame owns: main container, overflow, route transition animation.
 * AppShell owns:     mobile drawer state, mobile tab bar.
 *
 * The mobile drawer is bujogeek-specific behavior and stays here.
 * The sidebar and topbar are bujogeek domain content and stay in their files.
 */
import { useState } from 'react';
import { Drawer, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';
import { SIDEBAR_WIDTH, MOBILE_TAB_HEIGHT } from '../../utils/constants';

const AppShell = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const showNavigation = Boolean(user);

  const sidebar = showNavigation
    ? (isMobile ? null : <Sidebar />)
    : null;

  const topBar = <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />;

  return (
    <GeekShell
      sidebar={sidebar}
      topBar={topBar}
    >
      {/* Mobile sidebar — temporary drawer, bujogeek-specific behavior */}
      {isMobile && showNavigation && (
        <Drawer
          anchor="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          PaperProps={{
            sx: { width: SIDEBAR_WIDTH },
          }}
        >
          <Sidebar />
        </Drawer>
      )}

      {/* Page content — transition and main container owned by GeekAppFrame */}
      <GeekAppFrame
        sx={{ pb: isMobile && showNavigation ? `${MOBILE_TAB_HEIGHT}px` : 0 }}
      >
        {children}
      </GeekAppFrame>

      {/* Mobile tab bar — bujogeek-specific navigation pattern */}
      {isMobile && showNavigation && <MobileTabBar />}
    </GeekShell>
  );
};

export default AppShell;
