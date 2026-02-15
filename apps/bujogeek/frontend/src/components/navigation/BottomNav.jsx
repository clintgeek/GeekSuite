import React from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Paper
} from '@mui/material';
import {
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  CalendarViewWeek as CalendarViewWeekIcon,
  CalendarViewMonth as CalendarViewMonthIcon,
  CalendarToday as CalendarTodayIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

const allViews = [
  { value: 'all', label: 'All', icon: ViewListIcon },
  { value: 'daily', label: 'Daily', icon: CalendarTodayIcon },
  { value: 'weekly', label: 'Weekly', icon: CalendarViewWeekIcon },
  { value: 'monthly', label: 'Monthly', icon: CalendarViewMonthIcon },
  { value: 'year', label: 'Year', icon: ViewModuleIcon }
];

const BottomNav = ({ onAddClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const currentView = pathParts[2] || 'daily';
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Only show all, daily, weekly on mobile
  const views = isMobile
    ? allViews.filter(v => v.value !== 'monthly' && v.value !== 'year')
    : allViews;

  const handleChange = (event, newValue) => {
    // Handle special case for add button
    if (newValue === 'add') {
      if (onAddClick) onAddClick();
      return;
    }
    navigate(`/tasks/${newValue}`);
  };

  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000
      }}
      elevation={3}
    >
      <BottomNavigation
        value={currentView}
        onChange={handleChange}
        showLabels
      >
        {views.map((view) => (
          <BottomNavigationAction
            key={view.value}
            label={view.label}
            value={view.value}
            icon={<view.icon />}
          />
        ))}
        <BottomNavigationAction
          label="Add"
          value="add"
          icon={<AddIcon />}
          onClick={(e) => {
            e.preventDefault();
            if (onAddClick) onAddClick();
          }}
        />
      </BottomNavigation>
    </Paper>
  );
};

export default BottomNav;