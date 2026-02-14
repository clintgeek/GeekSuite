import { Box, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Avatar } from '@mui/material';
import { CalendarCheck, ClipboardCheck, Calendar, LayoutTemplate, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '@mui/material/styles';
import { SIDEBAR_WIDTH } from '../../utils/constants';
import { colors } from '../../theme/colors';

const navItems = [
  { label: 'Today', icon: CalendarCheck, path: '/today' },
  { label: 'Review', icon: ClipboardCheck, path: '/review' },
  { label: 'Plan', icon: Calendar, path: '/plan' },
];

const bottomItems = [
  { label: 'Templates', icon: LayoutTemplate, path: '/templates' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const theme = useTheme();

  const chromeBg = theme.palette.mode === 'dark' ? '#272420' : '#3B3632';
  const chromeDivider = 'rgba(255, 245, 230, 0.07)';

  const isActive = (path) => {
    if (path === '/plan') {
      return location.pathname.startsWith('/plan');
    }
    return location.pathname === path;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        backgroundColor: chromeBg,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1200,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          height: 56,
          px: 2.5,
          display: 'flex',
          alignItems: 'center',
          borderBottom: `1px solid ${chromeDivider}`,
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Source Sans 3", sans-serif',
            fontWeight: 300,
            color: 'rgba(255,248,240,0.82)' ,
            fontSize: '1.25rem',
            letterSpacing: '-0.02em',
          }}
        >
          bujo
          <Box component="span" sx={{ fontWeight: 600, color: colors.primary[400] }}>
            geek
          </Box>
        </Typography>
      </Box>

      {/* Main Navigation */}
      <List sx={{ px: 1, py: 1.5, flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  py: 1.25,
                  px: 2,
                  borderRadius: '6px',
                  borderLeft: active ? `3px solid ${colors.primary[400]}` : '3px solid transparent',
                  backgroundColor: active ? 'rgba(96, 152, 204, 0.09)' : 'transparent',
                  color: active ? 'rgba(255,248,240,0.92)' : 'rgba(255,248,240,0.45)',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    backgroundColor: active ? 'rgba(96, 152, 204, 0.12)' : 'rgba(255, 248, 240, 0.04)',
                    color: 'rgba(255,248,240,0.78)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                  <Icon size={20} />
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: active ? 500 : 400,
                    fontSize: '0.875rem',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Bottom Section */}
      <Divider sx={{ borderColor: chromeDivider }} />
      <List sx={{ px: 1, py: 1 }}>
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  py: 1,
                  px: 2,
                  borderRadius: '6px',
                  color: active ? 'rgba(255,248,240,0.85)' : 'rgba(255,248,240,0.4)',
                  backgroundColor: active ? 'rgba(96, 152, 204, 0.09)' : 'transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 248, 240, 0.04)',
                    color: 'rgba(255,248,240,0.7)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                  <Icon size={18} />
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.8125rem' }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}

        {/* User / Logout */}
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              py: 1,
              px: 2,
              borderRadius: '6px',
              color: 'rgba(255,248,240,0.35)',
              '&:hover': {
                backgroundColor: 'rgba(196, 69, 60, 0.07)',
                color: 'rgba(196, 69, 60, 0.75)',
              },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
              <LogOut size={18} />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{ fontSize: '0.8125rem' }}
            />
          </ListItemButton>
        </ListItem>
      </List>

      {/* User Badge */}
      {user && (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: `1px solid ${chromeDivider}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Avatar
            sx={{
              width: 28,
              height: 28,
              backgroundColor: colors.primary[500],
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </Avatar>
          <Typography
            sx={{
              color: 'rgba(255,248,240,0.3)',
              fontSize: '0.75rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.email || 'User'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default Sidebar;
