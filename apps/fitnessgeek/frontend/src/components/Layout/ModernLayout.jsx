import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '@geeksuite/auth';
import { GeekShell, GeekAppFrame, geekLayout } from '@geeksuite/ui';
import ThemeToggle from '../ThemeToggle';
import BottomNav from './BottomNavigation.jsx';
import Sidebar from './Sidebar';

const navSections = [
  {
    label: 'TRACK',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'HomeIcon' }, // Icon handled in MobileMenu helper
      { label: 'Food Log', path: '/food-log', icon: 'FoodIcon' },
      { label: 'Weight', path: '/weight', icon: 'WeightIcon' },
    ],
  },
  // ... Simplified for the example, the actual menu needs the icon components
];

// Helper to get icons for mobile menu (since we didn't export them from Sidebar)
import {
  Home as HomeIcon,
  Restaurant as FoodIcon,
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  Medication as MedsIcon,
  FitnessCenter as ActivityIcon,
  TrendingUp as HealthIcon,
  Search as SearchIcon,
  LocalDining as MyFoodsIcon,
  RestaurantMenu as MyMealsIcon,
  Calculate as WizardIcon,
  Insights as InsightsIcon,
} from '@mui/icons-material';

const mobileNavSections = [
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

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMobileMenuAnchor(null);
  };

  const topBar = (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        color: theme.palette.text.primary,
        width: '100%'
      }}
    >
      <Toolbar sx={{ minHeight: `${geekLayout.topBarHeight}px !important`, gap: 1 }}>
        {!isMobile && <Box sx={{ flexGrow: 1 }} />}
        {isMobile && (
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
              <Box component="span" sx={{ fontWeight: 400, color: theme.palette.primary.main }}>
                geek
              </Box>
            </Typography>
          </Box>
        )}
        
        <ThemeToggle />
        
        {!isMobile && (
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
        )}

        <IconButton
          onClick={isMobile ? (e) => setMobileMenuAnchor(e.currentTarget) : () => navigate('/settings')}
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
              color: isMobile ? theme.palette.primary.contrastText : 'inherit'
            }}
          >
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        </IconButton>
      </Toolbar>
    </AppBar>
  );

  return (
    <GeekShell 
      sidebar={!isMobile ? <Sidebar /> : null} 
      topBar={topBar}
    >
      <GeekAppFrame>
        <Box sx={{ pb: isMobile ? '88px' : 0 }}>
          <Outlet />
        </Box>
      </GeekAppFrame>

      {/* Mobile Menu */}
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
        {mobileNavSections.map((section) => [
          <Typography
            key={`label-${section.label}`}
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
                <ListItemText primaryTypographyProps={{ fontSize: '0.8125rem' }}>
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
          onClick={handleLogout}
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

      {isMobile && <BottomNav />}
    </GeekShell>
  );
}
