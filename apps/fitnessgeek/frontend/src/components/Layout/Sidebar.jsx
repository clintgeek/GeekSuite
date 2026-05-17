import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  IconButton,
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
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import { geekLayout } from '@geeksuite/ui';

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

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleNavigation = (path) => {
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box
      sx={{
        width: geekLayout.sidebarWidth,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0C0A09', // FitnessGeek signature dark sidebar
        borderRight: 'none',
        flexShrink: 0,
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
    </Box>
  );
};

export default Sidebar;
