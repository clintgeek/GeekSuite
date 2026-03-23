import React, { useState } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Container,
  Divider,
  Menu,
  MenuItem,
  Avatar,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Book as BookIcon,
  Add as AddIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  AutoStories as AutoStoriesIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';

const drawerWidth = 220;

const baseMenuItems = [
  { text: 'My Stories', icon: <BookIcon />, path: '/' },
  { text: 'Create Story', icon: <AddIcon />, path: '/create' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

const storyMenuItems = [
  { text: 'Characters', icon: <PeopleIcon />, path: '/characters' },
];

function Layout({ children, onThemeToggle, isDarkMode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useSharedAuthStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  // Check if we're in a story context (play or characters route)
  const isInStoryContext = location.pathname.startsWith('/play/') || location.pathname.startsWith('/characters/');

  // Combine menu items based on context
  const menuItems = isInStoryContext ? [...baseMenuItems, ...storyMenuItems] : baseMenuItems;

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    handleMenuClose();
  };

  const handleNavigation = (path) => {
    // If navigating to characters from a story context, include the storyId
    if (path === '/characters' && isInStoryContext) {
      const storyId = location.pathname.match(/\/(play|characters)\/([^\/]+)/)?.[2];
      if (storyId) {
        navigate(`/characters/${storyId}`);
      } else {
        navigate(path);
      }
    } else {
      navigate(path);
    }

    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const drawer = (
    <Box>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: '100%',
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: isMobile ? '56px !important' : '60px !important' }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo/Brand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexGrow: 1 }}>
            <AutoStoriesIcon sx={{ fontSize: 20 }} />
            <Typography variant="h6" noWrap component="div" sx={{
              fontWeight: 800,
              fontSize: '1.25rem',
              ml: 0.5
            }}>
              StoryGeek
            </Typography>
            <Typography variant="caption" sx={{
              opacity: 0.9,
              fontFamily: '"Roboto Mono", monospace',
              fontSize: '1rem',
              fontWeight: 700,
              ml: 0.5
            }}>
              &lt;/&gt;
            </Typography>
          </Box>

          {/* Right side actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Theme Toggle */}
            <IconButton
              onClick={onThemeToggle}
              color="inherit"
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                }
              }}
            >
              {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>

            {/* User Menu */}
            <IconButton
              onClick={handleMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
                <AccountIcon />
              </Avatar>
            </IconButton>

            {/* User Menu */}
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              PaperProps={{
                sx: {
                  backgroundColor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  mt: 1,
                },
              }}
            >
              <MenuItem onClick={handleMenuClose}>
                <AccountIcon sx={{ mr: 1 }} />
                {user?.username || 'User'}
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <LogoutIcon sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer - Temporary overlay */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            backgroundColor: 'background.paper',
            borderRight: '1px solid',
            borderColor: 'divider',
            mt: '60px', // Position below header
            height: 'calc(100vh - 60px)', // Full height minus header
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, md: 3 },
          width: '100%',
          mt: isMobile ? '56px' : '60px', // AppBar height
          backgroundColor: 'background.default',
          minHeight: 'calc(100vh - 60px)',
        }}
      >
        <Container maxWidth={isMobile ? 'md' : 'xl'}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}

export default Layout;