import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Storage as StorageIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  SmartToy as SmartToyIcon,
  Key as KeyIcon,
  ChevronLeft as ChevronLeftIcon,
  AccountCircle as AccountIcon
} from '@mui/icons-material';
import { useBaseGeekAuth } from './AuthContext';

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED = 68;

const navItems = [
  { label: 'Home', icon: <HomeIcon />, path: '/' },
  { label: 'DataGeek', icon: <StorageIcon />, path: '/datageek' },
  { label: 'UserGeek', icon: <PeopleIcon />, path: '/usergeek' },
  { label: 'AIGeek', icon: <SmartToyIcon />, path: '/aigeek' },
  { label: 'API Keys', icon: <KeyIcon />, path: '/api-keys' },
  { label: 'Account', icon: <AccountIcon />, path: '/account' },
  { label: 'Settings', icon: <SettingsIcon />, path: '/settings' }
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { logout, user } = useBaseGeekAuth();

  const sidebarWidth = collapsed && !isMobile ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebarContent = (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      py: 1,
    }}>
      {/* Brand */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
        px: collapsed && !isMobile ? 1 : 2,
        py: 1.5,
        mb: 1,
      }}>
        {(!collapsed || isMobile) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #e8a849 0%, #d4956a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#0c0c0f',
              fontFamily: '"Geist Mono", monospace',
            }}>
              bg
            </Box>
            <Box>
              <Typography sx={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'text.primary',
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
              }}>
                baseGeek
              </Typography>
              <Typography sx={{
                fontSize: '0.6rem',
                color: 'text.secondary',
                fontFamily: '"Geist Mono", monospace',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                mission control
              </Typography>
            </Box>
          </Box>
        )}
        {collapsed && !isMobile && (
          <Box sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #e8a849 0%, #d4956a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 700,
            color: '#0c0c0f',
            fontFamily: '"Geist Mono", monospace',
          }}>
            bg
          </Box>
        )}
        {!isMobile && !collapsed && (
          <IconButton
            size="small"
            onClick={() => setCollapsed(true)}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ mx: 2, mb: 1 }} />

      {/* Navigation */}
      <List sx={{ flex: 1, px: collapsed && !isMobile ? 0.5 : 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.label} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  minHeight: 40,
                  justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                  px: collapsed && !isMobile ? 1.5 : 1.5,
                  borderRadius: '8px',
                  mx: collapsed && !isMobile ? 0.5 : 1,
                }}
              >
                <ListItemIcon sx={{
                  minWidth: collapsed && !isMobile ? 0 : 36,
                  color: isActive ? 'primary.main' : 'text.secondary',
                  justifyContent: 'center',
                  '& .MuiSvgIcon-root': { fontSize: 20 },
                }}>
                  {item.icon}
                </ListItemIcon>
                {(!collapsed || isMobile) && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'text.primary' : 'text.secondary',
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ mx: 2, mb: 1 }} />

      {/* User / Logout */}
      <Box sx={{ px: collapsed && !isMobile ? 0.5 : 1, pb: 1 }}>
        {(!collapsed || isMobile) && user && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1.5,
            py: 1,
            mb: 0.5,
            borderRadius: '8px',
          }}>
            <Avatar sx={{
              width: 28,
              height: 28,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {(user.username || user.email || '?')[0].toUpperCase()}
            </Avatar>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography sx={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'text.primary',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}>
                {user.username || user.email}
              </Typography>
            </Box>
          </Box>
        )}
        <ListItemButton
          onClick={handleLogout}
          sx={{
            minHeight: 36,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            px: 1.5,
            borderRadius: '8px',
            mx: collapsed && !isMobile ? 0.5 : 1,
            '&:hover': {
              backgroundColor: 'rgba(199, 107, 107, 0.08)',
            },
          }}
        >
          <ListItemIcon sx={{
            minWidth: collapsed && !isMobile ? 0 : 36,
            color: 'text.secondary',
            justifyContent: 'center',
            '& .MuiSvgIcon-root': { fontSize: 20 },
          }}>
            <LogoutIcon />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText
              primary="Sign out"
              primaryTypographyProps={{
                fontSize: '0.8125rem',
                color: 'text.secondary',
              }}
            />
          )}
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />

      {/* Mobile AppBar */}
      {isMobile && (
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            backgroundColor: theme.palette.background.default,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Toolbar sx={{ minHeight: '56px !important', height: '56px' }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 1, color: 'text.secondary' }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 26,
                height: 26,
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #e8a849 0%, #d4956a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0c0c0f',
                fontFamily: '"Geist Mono", monospace',
              }}>
                bg
              </Box>
              <Typography sx={{
                fontWeight: 700,
                fontSize: '0.9rem',
                color: 'text.primary',
              }}>
                baseGeek
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Desktop Sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: sidebarWidth,
            flexShrink: 0,
            transition: 'width 200ms ease',
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              transition: 'width 200ms ease',
              overflowX: 'hidden',
            },
          }}
        >
          {sidebarContent}
          {collapsed && (
            <Box sx={{ textAlign: 'center', pb: 1 }}>
              <IconButton
                size="small"
                onClick={() => setCollapsed(false)}
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
              >
                <MenuIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Drawer>
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          mt: isMobile ? '56px' : 0,
          width: { md: `calc(100% - ${sidebarWidth}px)` },
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
          transition: 'width 200ms ease, margin 200ms ease',
        }}
      >
        <Box className="fade-in" sx={{ maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}