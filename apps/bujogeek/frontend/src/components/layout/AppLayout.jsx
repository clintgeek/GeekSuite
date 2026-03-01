import { useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  ListItemButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  Divider,
  Avatar,
  useMediaQuery,
  useTheme
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import CalendarViewMonthIcon from '@mui/icons-material/CalendarViewMonth';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle';

const AppLayout = ({
  navigation,
  children
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const showNavigation = Boolean(user);

  const DRAWER_WIDTH = 240;

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const menuItems = useMemo(() => [
    { label: 'All', icon: ViewListIcon, path: '/tasks/all' },
    { label: 'Daily', icon: CalendarTodayIcon, path: '/tasks/daily' },
    { label: 'Weekly', icon: CalendarViewWeekIcon, path: '/tasks/weekly' },
    { label: 'Monthly', icon: CalendarViewMonthIcon, path: '/tasks/monthly' },
    { label: 'Year', icon: ViewModuleIcon, path: '/tasks/year' }
  ], []);

  const handleLogout = () => {
    logout();
    setAccountMenuAnchor(null);
    navigate('/login');
  };

  const topBarLeftOffset = !isMobile && showNavigation ? DRAWER_WIDTH : 0;
  const chromeBg = '#0f172a';
  const chromeDivider = 'rgba(255, 255, 255, 0.1)';

  const DesktopSidebar = () => (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: chromeBg,
          borderRight: 'none',
          borderRadius: 0,
        },
      }}
    >
      <Box
        sx={{
          height: 56,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          borderBottom: `1px solid ${chromeDivider}`,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 300,
            color: '#ffffff',
            fontSize: '1.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          bujo
          <Box component="span" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
            geek
          </Box>
        </Typography>
      </Box>

      <List sx={{ px: 1, py: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  py: 1.25,
                  px: 2,
                  borderRadius: 0,
                  borderLeft: isActive ? `3px solid ${theme.palette.primary.main}` : '3px solid transparent',
                  backgroundColor: isActive ? 'rgba(96, 152, 204, 0.12)' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: isActive ? 'rgba(96, 152, 204, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                    color: '#ffffff',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                  <Icon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isActive ? 500 : 400,
                    fontSize: '0.875rem',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', mt: 'auto' }} />

      <List sx={{ px: 1, py: 1 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              py: 1.25,
              px: 2,
              borderRadius: 0,
              color: '#94a3b8',
              '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
              <LogoutIcon sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.875rem' }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      {!isMobile && showNavigation && <DesktopSidebar />}

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          left: topBarLeftOffset,
          width: `calc(100% - ${topBarLeftOffset}px)`,
          backgroundColor: chromeBg,
          borderBottom: `1px solid ${chromeDivider}`,
          color: '#ffffff',
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }}>
          {isMobile && showNavigation && (
            <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}

          <Box sx={{ flexGrow: 1 }} />

          <ThemeToggle />

          {showNavigation && (
            <IconButton
              color="inherit"
              onClick={(e) => setAccountMenuAnchor(e.currentTarget)}
              sx={{ ml: 1 }}
              aria-label="Open account menu"
            >
              <Avatar sx={{ width: 32, height: 32, backgroundColor: theme.palette.primary.main }}>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {isMobile && showNavigation && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={handleDrawerToggle}
          sx={{
            '& .MuiDrawer-paper': {
              width: 280,
              boxSizing: 'border-box',
              backgroundColor: chromeBg,
              borderRight: 'none',
            },
          }}
        >
          <Box
            sx={{
              height: 56,
              px: 3,
              display: 'flex',
              alignItems: 'center',
              borderBottom: `1px solid ${chromeDivider}`,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 300,
                color: '#ffffff',
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
              }}
            >
              bujo
              <Box component="span" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                geek
              </Box>
            </Typography>
          </Box>

          <List sx={{ px: 1, py: 1 }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    onClick={() => {
                      navigate(item.path);
                      setDrawerOpen(false);
                    }}
                    sx={{
                      py: 1.25,
                      px: 2,
                      borderRadius: 0,
                      borderLeft: isActive ? `3px solid ${theme.palette.primary.main}` : '3px solid transparent',
                      backgroundColor: isActive ? 'rgba(96, 152, 204, 0.12)' : 'transparent',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      '&:hover': {
                        backgroundColor: isActive ? 'rgba(96, 152, 204, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                        color: '#ffffff',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                      <Icon sx={{ fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', mt: 'auto' }} />
          <List sx={{ px: 1, py: 1 }}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={handleLogout}
                sx={{ color: '#94a3b8', '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' } }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                  <LogoutIcon sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText primary="Logout" />
              </ListItemButton>
            </ListItem>
          </List>
        </Drawer>
      )}

      <Menu
        anchorEl={accountMenuAnchor}
        open={Boolean(accountMenuAnchor)}
        onClose={() => setAccountMenuAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleLogout} sx={{ color: theme.palette.error.main }}>
          Logout
        </MenuItem>
      </Menu>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: showNavigation ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
          height: '100vh',
          boxSizing: 'border-box',
          pt: '56px',
          pb: showNavigation && isMobile ? '56px' : 0,
          backgroundColor: theme.palette.background.default,
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>

      {showNavigation && isMobile && (
        <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200 }}>
          {navigation}
        </Box>
      )}
    </Box>
  );
};

export default AppLayout;