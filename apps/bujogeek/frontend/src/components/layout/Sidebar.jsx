import { Box, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Avatar } from '@mui/material';
import { CalendarCheck, ClipboardCheck, Calendar, Hash, LayoutTemplate, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import { SIDEBAR_WIDTH } from '../../utils/constants';
import { colors } from '../../theme/colors';

const navItems = [
  { label: 'Today',     icon: CalendarCheck,  path: '/today',     description: 'Daily log' },
  { label: 'Review',    icon: ClipboardCheck, path: '/review',    description: 'End of day' },
  { label: 'Plan',      icon: Calendar,       path: '/plan',      description: 'Upcoming' },
  { label: 'Tags',      icon: Hash,           path: '/tags',      description: 'Browse tags' },
  { label: 'Templates', icon: LayoutTemplate, path: '/templates', description: 'Reusable tasks' },
];

// Chrome palette — dark tobacco, warm and grounded
// Consistent between light/dark app modes so the sidebar is always a dark anchor
const chrome = {
  bg:           '#252018',  // deeper tobacco — more luxurious than before
  bgHover:      '#2E2820',
  active:       '#1E1B14',  // sunken active state
  border:       'rgba(255, 245, 220, 0.07)',
  text:         'rgba(255, 245, 220, 0.85)',
  textMuted:    'rgba(255, 245, 220, 0.38)',
  textDisabled: 'rgba(255, 245, 220, 0.2)',
  accent:       colors.primary[400],
  accentBg:     'rgba(96, 152, 204, 0.1)',
  danger:       'rgba(184, 60, 52, 0.75)',
  dangerBg:     'rgba(184, 60, 52, 0.08)',
  logo:         'rgba(255, 245, 220, 0.78)',
  logoAccent:   colors.primary[400],
  divider:      'rgba(255, 245, 220, 0.06)',
};

const NavItem = ({ item, active, onClick }) => {
  const Icon = item.icon;

  return (
    <ListItem disablePadding sx={{ mb: 0.125 }}>
      <ListItemButton
        onClick={onClick}
        sx={{
          py: 1.125,
          px: 1.75,
          borderRadius: '6px',
          position: 'relative',
          color: active ? chrome.text : chrome.textMuted,
          backgroundColor: active ? chrome.active : 'transparent',
          transition: 'color 0.14s ease, background-color 0.14s ease',
          '&:hover': {
            backgroundColor: active ? chrome.active : chrome.bgHover,
            color: active ? chrome.text : 'rgba(255, 245, 220, 0.72)',
          },
          // Remove default MUI hover
          '&.Mui-selected': { backgroundColor: 'transparent' },
        }}
        aria-current={active ? 'page' : undefined}
      >
        {/* Active accent bar — animated */}
        <AnimatePresence>
          {active && (
            <motion.div
              layoutId="nav-active-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: '56%',
                borderRadius: '0 2px 2px 0',
                backgroundColor: chrome.accent,
              }}
            />
          )}
        </AnimatePresence>

        <ListItemIcon
          sx={{
            color: active ? chrome.accent : 'inherit',
            minWidth: 34,
            transition: 'color 0.14s ease',
          }}
        >
          <Icon size={17} strokeWidth={active ? 2 : 1.75} />
        </ListItemIcon>

        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            fontFamily:    '"Source Sans 3", sans-serif',
            fontWeight:    active ? 600 : 400,
            fontSize:      '0.875rem',
            letterSpacing: active ? '-0.005em' : '0',
            color:         'inherit',
            lineHeight:    1,
          }}
        />
      </ListItemButton>
    </ListItem>
  );
};

const Sidebar = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const theme = useTheme();

  const isActive = (path) => {
    if (path === '/plan') return location.pathname.startsWith('/plan');
    return location.pathname === path;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userInitial = user?.email?.[0]?.toUpperCase() || 'U';
  // Truncate email gracefully
  const displayEmail = user?.email
    ? user.email.length > 22
      ? `${user.email.slice(0, 20)}…`
      : user.email
    : 'Account';

  return (
    <Box
      sx={{
        width:           SIDEBAR_WIDTH,
        height:          '100vh',
        backgroundColor: chrome.bg,
        display:         'flex',
        flexDirection:   'column',
        flexShrink:      0,
        // Subtle inner shadow on the right edge — depth illusion
        boxShadow:       '2px 0 20px rgba(0,0,0,0.28)',
      }}
    >
      {/* ─── Wordmark ─────────────────────────────────────────── */}
      <Box
        sx={{
          height:      56,
          px:          2.25,
          display:     'flex',
          alignItems:  'center',
          borderBottom: `1px solid ${chrome.border}`,
          flexShrink:  0,
          userSelect:  'none',
        }}
      >
        {/* Minimal monogram mark */}
        <Box
          sx={{
            width:           26,
            height:          26,
            borderRadius:    '5px',
            border:          `1.5px solid ${chrome.logoAccent}`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            mr:              1.25,
            flexShrink:      0,
            opacity:         0.9,
          }}
        >
          <Typography
            sx={{
              fontFamily:    '"IBM Plex Mono", monospace',
              fontSize:      '0.625rem',
              fontWeight:    700,
              color:         chrome.logoAccent,
              letterSpacing: '0.04em',
              lineHeight:    1,
            }}
          >
            BJ
          </Typography>
        </Box>

        <Box>
          <Typography
            sx={{
              fontFamily: '"Source Sans 3", sans-serif',
              fontWeight: 300,
              color:      chrome.logo,
              fontSize:   '1.0625rem',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            bujo
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color:      chrome.logoAccent,
                letterSpacing: '-0.01em',
              }}
            >
              geek
            </Box>
          </Typography>
        </Box>
      </Box>

      {/* ─── Main Navigation ──────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Section label */}
        <Box sx={{ px: 2.25, pt: 2.25, pb: 0.75 }}>
          <Typography
            sx={{
              fontFamily:    '"IBM Plex Mono", monospace',
              fontSize:      '0.5625rem',
              fontWeight:    700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color:         chrome.textDisabled,
              lineHeight:    1,
            }}
          >
            Navigation
          </Typography>
        </Box>

        <List sx={{ px: 1, py: 0 }}>
          {navItems.map((item) => (
            <NavItem
              key={item.path}
              item={item}
              active={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </List>
      </Box>

      {/* ─── Footer zone ─────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0 }}>
        {/* Logout */}
        <List sx={{ px: 1, py: 0.75 }}>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}
              sx={{
                py:           0.875,
                px:           1.75,
                borderRadius: '6px',
                color:        chrome.textDisabled,
                transition:   'color 0.14s ease, background-color 0.14s ease',
                '&:hover': {
                  backgroundColor: chrome.dangerBg,
                  color:           chrome.danger,
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}>
                <LogOut size={15} strokeWidth={1.75} />
              </ListItemIcon>
              <ListItemText
                primary="Sign out"
                primaryTypographyProps={{
                  fontFamily: '"Source Sans 3", sans-serif',
                  fontSize:   '0.8125rem',
                  color:      'inherit',
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>

        {/* User badge */}
        {user && (
          <Box
            sx={{
              px:          2.25,
              py:          1.25,
              borderTop:   `1px solid ${chrome.divider}`,
              display:     'flex',
              alignItems:  'center',
              gap:         1.25,
            }}
          >
            <Avatar
              sx={{
                width:           26,
                height:          26,
                backgroundColor: colors.primary[700],
                fontSize:        '0.6875rem',
                fontFamily:      '"Fraunces", serif',
                fontWeight:      600,
                letterSpacing:   '-0.01em',
                color:           'rgba(255,255,255,0.9)',
                flexShrink:      0,
              }}
            >
              {userInitial}
            </Avatar>
            <Typography
              sx={{
                color:         chrome.textDisabled,
                fontSize:      '0.6875rem',
                fontFamily:    '"Source Sans 3", sans-serif',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                whiteSpace:    'nowrap',
                flex:          1,
                minWidth:      0,
              }}
            >
              {displayEmail}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;
