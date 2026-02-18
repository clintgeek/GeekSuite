import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography
} from '@mui/material';
import {
  Person as ProfileIcon,
  Restaurant as FoodSearchIcon,
  Restaurant as FoodIcon,
  LocalDining as MyFoodsIcon,
  RestaurantMenu as MyMealsIcon,
  MedicalServices as MedicationIcon,
  Flag as GoalsIcon,
  Calculate as CalorieIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '@geeksuite/auth';

const AppDrawer = ({ open, onClose }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { logout } = useAuth();

  const handleNavigation = (path) => {
    navigate(path);
    onClose();
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  const menuItems = [
    {
      text: 'Medications',
      icon: <MedicationIcon />,
      path: '/medications',
      description: 'Track meds & supplements'
    },
    {
      text: 'Calorie Goal Wizard',
      icon: <CalorieIcon />,
      path: '/calorie-wizard',
      description: 'Set calorie goals and create nutrition plans'
    },
    {
      text: 'My Foods',
      icon: <MyFoodsIcon />,
      path: '/my-foods',
      description: 'Manage your saved foods'
    },
    {
      text: 'My Meals',
      icon: <MyMealsIcon />,
      path: '/my-meals',
      description: 'Manage your saved meals'
    },
    {
      text: 'Food Search',
      icon: <FoodSearchIcon />,
      path: '/food-search',
      description: 'Search and manage food database'
    },
    {
      text: 'Profile & Settings',
      icon: <ProfileIcon />,
      path: '/profile',
      description: 'Manage your account and preferences'
    }
  ];

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 280,
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${ theme.palette.divider }`,
          color: theme.palette.text.primary,
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
        <FoodIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.primary.main, mr: 0.5 }}>
          FitnessGeek
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
          &lt;/&gt;
        </Typography>
      </Box>

      <Divider />

      <List sx={{ pt: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              onClick={() => handleNavigation(item.path)}
              sx={{
                py: 2,
                px: 3,
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                },
              }}
            >
              <ListItemIcon sx={{ color: theme.palette.primary.main, minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                secondary={item.description}
                primaryTypographyProps={{
                  fontSize: '0.95rem',
                  fontWeight: 500,
                }}
                secondaryTypographyProps={{
                  fontSize: '0.75rem',
                  color: theme.palette.text.secondary,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ mt: 'auto' }} />

      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              py: 2,
              px: 3,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <ListItemIcon sx={{ color: theme.palette.error.main, minWidth: 40 }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{
                fontSize: '0.95rem',
                fontWeight: 500,
                color: theme.palette.error.main,
              }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default AppDrawer;