import React from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Home as HomeIcon,
  Book as FoodLogIcon,
  DirectionsRun as ActivityIcon,
  Person as ProfileIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isVeryNarrow = useMediaQuery('(max-width:320px)');
  const theme = useTheme();

  const navigationItems = [
    { label: 'Home', value: 'home', path: '/dashboard', icon: HomeIcon },
    { label: 'Log', value: 'food-log', path: '/food-log', icon: FoodLogIcon },
    { label: 'Activity', value: 'activity', path: '/activity', icon: ActivityIcon },
    { label: 'Profile', value: 'profile', path: '/profile', icon: ProfileIcon },
  ];

  const getCurrentValue = () => {
    const path = location.pathname;
    const current = navigationItems.find((item) => item.path === path);
    return current?.value || 'home';
  };

  const handleNavigate = (value) => {
    const target = navigationItems.find((item) => item.value === value);
    navigate(target?.path || '/dashboard');
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: theme.palette.background.paper,
        borderTop: `1px solid ${theme.palette.divider}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <BottomNavigation
        value={getCurrentValue()}
        showLabels={!isVeryNarrow}
        onChange={(event, newValue) => handleNavigate(newValue)}
        sx={{
          backgroundColor: theme.palette.background.paper,
          '& .MuiBottomNavigationAction-root': {
            color: theme.palette.text.secondary,
            minWidth: { xs: 60, sm: 80 },
            padding: { xs: '6px 0', sm: '6px 12px' },
            '&.Mui-selected': {
              color: theme.palette.primary.main,
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: { xs: '0.65rem', sm: '0.75rem' },
            fontWeight: 500,
          },
        }}
      >
        {navigationItems.map(({ label, value, icon: Icon }) => (
          <BottomNavigationAction
            key={value}
            label={label}
            value={value}
            icon={<Icon />}
          />
        ))}
      </BottomNavigation>
    </Box>
  );
};

export default BottomNav;