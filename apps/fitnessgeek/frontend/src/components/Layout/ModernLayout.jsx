import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Home as HomeIcon,
  Restaurant as FoodIcon,
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  Medication as MedsIcon,
  Logout as LogoutIcon,
  FitnessCenter as ActivityIcon,
  Insights as InsightsIcon,
  TrendingUp as HealthIcon,
  Search as SearchIcon,
  LocalDining as MyFoodsIcon,
  RestaurantMenu as MyMealsIcon,
  Calculate as WizardIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '@geeksuite/auth';
import ThemeToggle from '../ThemeToggle';
import BottomNav from './BottomNavigation.jsx';
import { keyframes } from '@mui/material/styles';

// Page-transition fade/rise — applied to the <main> wrapper, re-runs on route change
const pageEnter = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const DRAWER_WIDTH = 232;

const navSections = [
  {
    label: 'TRACK',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: HomeIcon },
      { label: 'Food Log', path: '/food-log', icon: FoodIcon },
      { label: 'Weight', path: '/weight', icon: WeightIcon },
    ],
  },
  {
    label: 'HEALTH',
    items: [
      { label: 'Blood Pressure', path: '/blood-pressure', icon: BPIcon },
      { label: 'Medications', path: '/medications', icon: MedsIcon },
      { label: 'Activity', path: '/activity', icon: ActivityIcon },
      { label: 'Health Dashboard', path: '/health', icon: HealthIcon },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { label: 'Food Search', path: '/food-search', icon: SearchIcon },
      { label: 'My Foods', path: '/my-foods', icon: MyFoodsIcon },
      { label: 'My Meals', path: '/my-meals', icon: MyMealsIcon },
      { label: 'Calorie Wizard', path: '/calorie-wizard', icon: WizardIcon },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { label: 'Reports', path: '/reports', icon: InsightsIcon },
    ],
  },
];

export default function ModernLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, logout } = useAuth();
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState(null);

  const handleNavigation = (path) => {
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Desktop Sidebar
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
          backgroundColor: '#0C0A09',
          borderRight: 'none',
          borderRadius: 0,
        },
      }}
    >
      {/* Logo */}
      <Box sx={{ px: 2.5, py: 2.5, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 400,
            color: '#F5F5F4',
            fontSize: '1.375rem',
            letterSpacing: '-0.02em',
            fontFamily: '"DM Serif Display", Georgia, serif',
          }}
        >
          fitness
          <Box
            component="span"
            sx={{
              fontWeight: 400,
              color: '#2DD4BF',
            }}
          >
            geek
          </Box>
        </Typography>
      </Box>

      {/* Grouped Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {navSections.map((section) => (
          <Box key={section.label} sx={{ mb: 0.5 }}>
            <Typography
              variant="overline"
              sx={{
                px: 2.5,
                pt: 2,
                pb: 0.5,
                display: 'block',
                color: 'rgba(255, 255, 255, 0.3)',
                fontSize: '0.625rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
              }}
            >
              {section.label}
            </Typography>
            <List disablePadding>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <ListItem key={item.path} disablePadding>
                    <ListItemButton
                      onClick={() => handleNavigation(item.path)}
                      sx={{
                        py: 0.875,
                        px: 2.5,
                        borderRadius: 0,
                        borderLeft: isActive ? '3px solid #2DD4BF' : '3px solid transparent',
                        backgroundColor: isActive ? 'rgba(45, 212, 191, 0.08)' : 'transparent',
                        color: isActive ? '#F5F5F4' : '#A8A29E',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          backgroundColor: isActive ? 'rgba(45, 212, 191, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                          color: '#F5F5F4',
                        },
                      }}
                    >
                      <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                        <Icon sx={{ fontSize: 18 }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontWeight: isActive ? 600 : 400,
                          fontSize: '0.8125rem',
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Bottom: Settings + User */}
      <Box sx={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', p: 1 }}>
        <ListItemButton
          onClick={() => handleNavigation('/settings')}
          sx={{
            py: 0.875,
            px: 1.5,
            borderRadius: 0,
            color: '#A8A29E',
            transition: 'all 0.15s ease',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#F5F5F4',
            },
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
            <SettingsIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText
            primary="Settings"
            primaryTypographyProps={{ fontWeight: 400, fontSize: '0.8125rem' }}
          />
        </ListItemButton>
        <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)', my: 0.5 }} />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1.5,
            py: 1,
          }}
        >
          <Avatar
            sx={{
              width: 28,
              height: 28,
              backgroundColor: '#2DD4BF',
              color: '#0C0A09',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </Avatar>
          <Typography
            variant="body2"
            sx={{ color: '#A8A29E', fontSize: '0.8125rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {user?.username || 'User'}
          </Typography>
          <IconButton
            onClick={handleLogout}
            size="small"
            sx={{
              color: '#A8A29E',
              '&:hover': { color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
            }}
          >
            <LogoutIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Drawer>
  );

  // Mobile Top Bar
  const MobileTopBar = () => (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        display: { xs: 'block', md: 'none' },
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${ theme.palette.divider }`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 400,
              color: theme.palette.text.primary,
              fontSize: '1.25rem',
              letterSpacing: '-0.02em',
              fontFamily: '"DM Serif Display", Georgia, serif',
            }}
          >
            fitness
            <Box
              component="span"
              sx={{
                fontWeight: 400,
                color: theme.palette.primary.main,
              }}
            >
              geek
            </Box>
          </Typography>
        </Box>
        <ThemeToggle />
        <IconButton onClick={(e) => setMobileMenuAnchor(e.currentTarget)} sx={{ ml: 1 }}>
          <Avatar sx={{ width: 32, height: 32, backgroundColor: theme.palette.primary.main }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        </IconButton>
      </Toolbar>
    </AppBar>
  );

  // Desktop Top Bar
  const DesktopTopBar = () => (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        display: { xs: 'none', md: 'block' },
        left: DRAWER_WIDTH,
        width: `calc(100% - ${ DRAWER_WIDTH }px)`,
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${ theme.palette.divider }`,
      }}
    >
      <Toolbar sx={{ justifyContent: 'flex-end', minHeight: '56px !important', gap: 1 }}>
        <ThemeToggle />
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: theme.palette.text.secondary,
            mx: 1.5,
          }}
        >
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </Typography>
        <IconButton
          onClick={() => navigate('/settings')}
          sx={{
            transition: 'transform 180ms ease',
            '&:hover': { transform: 'scale(1.05)' },
          }}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              backgroundColor: theme.palette.primary.main,
              fontFamily: "'DM Serif Display', serif",
              fontWeight: 400,
              fontSize: '1rem',
            }}
          >
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        </IconButton>
      </Toolbar>
    </AppBar>
  );

  // Mobile Menu
  const MobileMenu = () => (
    <Menu
      anchorEl={mobileMenuAnchor}
      open={Boolean(mobileMenuAnchor)}
      onClose={() => setMobileMenuAnchor(null)}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      PaperProps={{
        sx: {
          mt: 1,
          minWidth: 220,
          maxHeight: '70vh',
        },
      }}
    >
      {navSections.map((section) => [
        <Typography
          key={`label-${ section.label }`}
          variant="overline"
          sx={{
            px: 2,
            pt: 1.5,
            pb: 0.5,
            display: 'block',
            color: theme.palette.text.secondary,
            fontSize: '0.625rem',
          }}
        >
          {section.label}
        </Typography>,
        ...section.items.map((item) => {
          const Icon = item.icon;
          return (
            <MenuItem
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setMobileMenuAnchor(null);
              }}
              selected={location.pathname === item.path}
              sx={{ minHeight: 40 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Icon sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{ fontSize: '0.8125rem' }}
              >
                {item.label}
              </ListItemText>
            </MenuItem>
          );
        }),
      ])}
      <Divider sx={{ my: 0.5 }} />
      <MenuItem
        onClick={() => {
          navigate('/settings');
          setMobileMenuAnchor(null);
        }}
        sx={{ minHeight: 40 }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <SettingsIcon sx={{ fontSize: 18 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8125rem' }}>
          Settings
        </ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          handleLogout();
          setMobileMenuAnchor(null);
        }}
        sx={{ color: theme.palette.error.main, minHeight: 40 }}
      >
        <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
          <LogoutIcon sx={{ fontSize: 18 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8125rem' }}>
          Logout
        </ListItemText>
      </MenuItem>
    </Menu>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      {/* Desktop Sidebar */}
      {!isMobile && <DesktopSidebar />}

      {/* Top Bars */}
      {isMobile ? <MobileTopBar /> : <DesktopTopBar />}

      {/* Main Content — page entry animation keyed by route */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: `calc(100% - ${ DRAWER_WIDTH }px)` },
          minHeight: '100vh',
          pt: { xs: '64px', md: '56px' },
          pb: { xs: '88px', md: 0 },
          backgroundColor: theme.palette.background.default,
        }}
      >
        <Box
          key={location.pathname}
          sx={{
            animation: `${pageEnter} 380ms cubic-bezier(0.22, 1, 0.36, 1)`,
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* Mobile Menu */}
      {isMobile && <MobileMenu />}
      {isMobile && <BottomNav />}
    </Box>
  );
}
