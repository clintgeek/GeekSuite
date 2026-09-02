import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Button,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  alpha
} from '@mui/material';
import {
  Add as AddIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useThemeMode } from '@geeksuite/user';
import { logout } from '@geeksuite/auth';
import { GeekAppSwitcher, GeekThemeToggle, geekLayout } from '@geeksuite/ui';

const Header = ({ user, setActiveView, setAddBookOpen }) => {
  const theme = useTheme();
  const { theme: mode, toggleTheme } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpenMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleSettings = () => {
    setActiveView("profile");
    handleCloseMenu();
  };

  const handleLogout = async () => {
    handleCloseMenu();
    await logout();
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        color: theme.palette.text.primary,
        width: '100%',
        flexShrink: 0,
      }}
    >
      <Toolbar sx={{ minHeight: `${geekLayout.topBarHeight}px !important`, px: { xs: 2, md: 3 } }}>
        <Box 
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', flexGrow: 1 }}
          onClick={() => setActiveView("library")}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 400,
              fontFamily: '"DM Serif Display", serif',
              fontSize: '1.25rem',
              letterSpacing: '-0.02em',
            }}
          >
            BookGeek
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddBookOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              bgcolor: 'primary.main',
              '&:hover': {
                bgcolor: 'primary.dark',
              }
            }}
          >
            Add book
          </Button>

          {/* Suite controls, in the suite order: [theme][switcher][account] */}
          <GeekThemeToggle
            mode={mode}
            onToggle={toggleTheme}
            sx={{
              color: 'text.primary',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
            }}
          />

          <GeekAppSwitcher
            currentApp="bookgeek"
            sx={{
              color: 'text.primary',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
            }}
          />

          <IconButton
            onClick={handleOpenMenu}
            size="small"
            sx={{
              p: 0.25,
              borderRadius: 999,
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
            }}
            aria-label="User menu"
          >
            <Avatar 
              sx={{ 
                width: 32, 
                height: 32, 
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
              }}
            >
              { (user.username || user.email)?.[0]?.toUpperCase() || 'U' }
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleCloseMenu}
            onClick={handleCloseMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{
              sx: {
                minWidth: 160,
                mt: 1,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper',
              }
            }}
          >
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Settings</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
