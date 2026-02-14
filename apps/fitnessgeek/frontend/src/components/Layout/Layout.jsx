import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  IconButton,
  Toolbar,
  Typography
} from '@mui/material';
import {
  Menu as MenuIcon,
  Restaurant as FoodIcon
} from '@mui/icons-material';
import BottomNav from './BottomNavigation.jsx';
import AppDrawer from './Drawer.jsx';
import ThemeToggle from '../ThemeToggle.jsx';

const Layout = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <CssBaseline />

      {/* Header Bar - Modern style */}
      <AppBar
        position="fixed"
        sx={{
          boxShadow: 'none',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 0,
        }}
      >
        <Toolbar sx={{ minHeight: '64px !important' }}>
          <IconButton
            color="inherit"
            aria-label="menu"
            edge="start"
            sx={{ mr: 1 }}
            onClick={handleDrawerToggle}
          >
            <MenuIcon />
          </IconButton>

          <FoodIcon sx={{ mr: 1, color: 'white' }} />
          <Typography variant="h4" noWrap component="div" sx={{ fontWeight: 600, color: 'white', mr: 0.5 }}>
            FitnessGeek
          </Typography>
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600, color: 'white' }}>
            &lt;/&gt;
          </Typography>

          {/* Spacer to push theme toggle to the right */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Theme Toggle */}
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      {/* Main Content Area - Modern style */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: 'calc(100vh - 64px - 56px)', // Account for header and bottom nav
          paddingTop: '64px', // offset for fixed app bar
          paddingBottom: '56px', // Space for bottom navigation
        }}
      >
        <Box sx={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          padding: '0 8px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Outlet />
        </Box>
      </Box>

      {/* Bottom Navigation - GeekSuite style */}
      <BottomNav />

      {/* App Drawer */}
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </Box>
  );
};

export default Layout;