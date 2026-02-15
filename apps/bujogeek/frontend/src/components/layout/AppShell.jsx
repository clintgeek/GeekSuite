import { useState } from 'react';
import { Box, Drawer, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';
import { SIDEBAR_WIDTH, TOPBAR_HEIGHT, MOBILE_TAB_HEIGHT } from '../../utils/constants';

const AppShell = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const location = useLocation();
  const showNavigation = Boolean(user);

  // Get the top-level path segment for transition key (avoids re-animating on sub-route changes)
  const transitionKey = '/' + (location.pathname.split('/')[1] || '');

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      {/* Desktop Sidebar */}
      {!isMobile && showNavigation && <Sidebar />}

      {/* Mobile Sidebar Drawer */}
      {isMobile && showNavigation && (
        <Drawer
          anchor="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: 280,
              backgroundColor: theme.palette.mode === 'dark' ? '#272420' : '#3B3632',
              borderRight: 'none',
            },
          }}
        >
          <Sidebar />
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          ml: !isMobile && showNavigation ? `${SIDEBAR_WIDTH}px` : 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Top Bar */}
        <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />

        {/* Page Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            pb: isMobile && showNavigation ? `${MOBILE_TAB_HEIGHT}px` : 0,
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={transitionKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ minHeight: '100%' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>

      {/* Mobile Tab Bar */}
      {isMobile && showNavigation && <MobileTabBar />}
    </Box>
  );
};

export default AppShell;
