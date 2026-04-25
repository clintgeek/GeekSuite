import React, { useState } from 'react';
import {
  AppBar, Box, Drawer, IconButton, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, useTheme,
  useMediaQuery, Container, Divider, Menu, MenuItem, Avatar, alpha,
} from '@mui/material';
import {
  Menu as MenuIcon, Book as BookIcon, Add as AddIcon,
  People as PeopleIcon, Settings as SettingsIcon,
  DarkMode as DarkModeIcon, LightMode as LightModeIcon,
  AutoStories as AutoStoriesIcon, Logout as LogoutIcon,
  AccountCircle as AccountIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';

const drawerWidth = 240;

const baseMenuItems = [
  { text: 'My Stories', icon: <BookIcon />, path: '/' },
  { text: 'Begin a Tale', icon: <AddIcon />, path: '/create' },
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
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const isInStoryContext = location.pathname.startsWith('/play/') || location.pathname.startsWith('/characters/');
  const menuItems = isInStoryContext ? [...baseMenuItems, ...storyMenuItems] : baseMenuItems;

  const handleNavigation = (path) => {
    if (path === '/characters' && isInStoryContext) {
      const storyId = location.pathname.match(/\/(play|characters)\/([^/]+)/)?.[2];
      if (storyId) { navigate(`/characters/${storyId}`); } else { navigate(path); }
    } else {
      navigate(path);
    }
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setAnchorEl(null);
  };

  const gold = theme.palette.codex?.gold || '#c9a84c';

  const drawer = (
    <Box sx={{ pt: 2.5, px: 1 }}>
      {/* Drawer Header */}
      <Box sx={{ px: 2, mb: 3, textAlign: 'center' }}>
        <Typography variant="overline" sx={{
          color: alpha(gold, 0.6),
          display: 'block',
          mb: 0.5,
        }}>
          Chapters
        </Typography>
        <Divider sx={{ borderColor: alpha(gold, 0.15) }} />
      </Box>

      <List sx={{ px: 0.5 }}>
        {menuItems.map((item, i) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 1.5,
                  py: 1.25,
                  transition: 'all 0.2s ease',
                  '&.Mui-selected': {
                    backgroundColor: alpha(gold, 0.12),
                    borderLeft: `3px solid ${gold}`,
                    '&:hover': { backgroundColor: alpha(gold, 0.18) },
                  },
                  '&:hover': {
                    backgroundColor: alpha(gold, 0.06),
                  },
                }}
              >
                <ListItemIcon sx={{
                  color: isActive ? gold : 'text.secondary',
                  minWidth: 38,
                  transition: 'color 0.2s',
                }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontFamily: '"Cinzel", serif',
                    fontSize: '0.8rem',
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: '0.03em',
                    color: isActive ? gold : 'text.primary',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Header */}
      <AppBar
        position="fixed"
        sx={{
          background: theme.palette.mode === 'dark'
            ? `linear-gradient(90deg, ${alpha('#1a1614', 0.95)} 0%, ${alpha('#2a2420', 0.95)} 100%)`
            : `linear-gradient(90deg, ${alpha('#fff8ef', 0.95)} 0%, ${alpha('#f4ece1', 0.95)} 100%)`,
          color: 'text.primary',
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: isMobile ? '56px !important' : '64px !important' }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{
              mr: 2,
              color: 'text.secondary',
              '&:hover': { color: gold, backgroundColor: alpha(gold, 0.08) },
            }}
          >
            <MenuIcon />
          </IconButton>

          {/* Brand */}
          <Box sx={{
            display: 'flex', alignItems: 'baseline', gap: 0.75, flexGrow: 1,
            cursor: 'pointer',
          }}
            onClick={() => navigate('/')}
          >
            <AutoStoriesIcon sx={{
              fontSize: 22,
              color: gold,
              alignSelf: 'center',
              filter: `drop-shadow(0 0 4px ${alpha(gold, 0.3)})`,
            }} />
            <Typography sx={{
              fontFamily: '"Cinzel Decorative", serif',
              fontWeight: 700,
              fontSize: '1.3rem',
              letterSpacing: '0.06em',
              color: 'text.primary',
            }}>
              Story
            </Typography>
            <Typography sx={{
              fontFamily: '"Cinzel Decorative", serif',
              fontWeight: 700,
              fontSize: '1.3rem',
              letterSpacing: '0.06em',
              color: gold,
            }}>
              Geek
            </Typography>
          </Box>

          {/* Right actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              onClick={onThemeToggle}
              sx={{
                color: 'text.secondary',
                '&:hover': { color: gold, backgroundColor: alpha(gold, 0.08) },
              }}
            >
              {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>

            <IconButton
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ '&:hover': { backgroundColor: alpha(gold, 0.08) } }}
            >
              <Avatar sx={{
                width: 30, height: 30,
                bgcolor: alpha(gold, 0.15),
                color: gold,
                fontSize: '0.8rem',
                fontFamily: '"Cinzel", serif',
                fontWeight: 700,
              }}>
                {user?.username?.[0]?.toUpperCase() || 'G'}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              PaperProps={{
                sx: {
                  mt: 1,
                  border: `1px solid ${alpha(gold, 0.15)}`,
                  minWidth: 180,
                },
              }}
            >
              <MenuItem disabled sx={{ opacity: '0.7 !important' }}>
                <AccountIcon sx={{ mr: 1, fontSize: 18 }} />
                <Typography variant="body2">{user?.username || 'Adventurer'}</Typography>
              </MenuItem>
              <Divider sx={{ borderColor: alpha(gold, 0.1) }} />
              <MenuItem onClick={handleLogout}>
                <LogoutIcon sx={{ mr: 1, fontSize: 18 }} />
                <Typography variant="body2">Depart</Typography>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            mt: isMobile ? '56px' : '64px',
            height: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 64px)',
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          width: '100%',
          mt: isMobile ? '56px' : '64px',
          minHeight: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 64px)',
        }}
      >
        <Container maxWidth="xl">
          {children}
        </Container>
      </Box>
    </Box>
  );
}

export default Layout;
