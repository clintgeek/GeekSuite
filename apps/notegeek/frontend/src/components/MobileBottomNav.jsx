import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Paper, Portal, Typography, useTheme } from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

function getNavValue(pathname) {
  if (pathname.startsWith('/search'))                                     return 'search';
  if (pathname.startsWith('/notes/new'))                                  return 'new';
  if (pathname === '/')                                                    return 'home';
  if (pathname.startsWith('/notes') || pathname.startsWith('/tags/'))     return 'notes';
  return 'home';
}

const NAV_ITEMS = [
  { value: 'home',   label: 'Home',   icon: HomeOutlinedIcon,          activeIcon: HomeIcon,          path: '/'          },
  { value: 'search', label: 'Search', icon: SearchOutlinedIcon,        activeIcon: SearchIcon,        path: '/search'    },
  { value: 'new',    label: 'New',    icon: AddOutlinedIcon,           activeIcon: AddOutlinedIcon,   path: '/notes/new', accent: true },
  { value: 'notes',  label: 'Notes',  icon: AutoStoriesOutlinedIcon,   activeIcon: AutoStoriesIcon,   path: '/notes'     },
];

function NavItem({ item, isActive, onClick }) {
  const theme = useTheme();
  const Icon = isActive ? item.activeIcon : item.icon;

  return (
    <ButtonBase
      onClick={onClick}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        py: 0.75,
        gap: 0.375,
        position: 'relative',
        transition: 'background 80ms ease',
        '&:hover': {
          bgcolor: isActive
            ? theme.palette.glow.soft
            : `rgba(${theme.palette.mode === 'dark' ? '237,230,214' : '31,28,22'},0.04)`,
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: -2,
        },
      }}
    >
      {/* Active indicator: 4px top border in primary — ink-stamp feel */}
      {isActive && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 32,
            height: 3,
            borderRadius: '0 0 3px 3px',
            bgcolor: 'primary.main',
          }}
        />
      )}

      <Icon
        sx={{
          fontSize: item.accent ? 22 : 20,
          color: isActive ? 'primary.main' : 'text.disabled',
          transition: 'color 100ms ease',
        }}
      />

      <Typography
        sx={{
          fontFamily: theme.typography.fontFamilyMono,
          fontSize: '0.5625rem',
          fontWeight: isActive ? 600 : 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: isActive ? 'primary.main' : 'text.disabled',
          transition: 'color 100ms ease',
        }}
      >
        {item.label}
      </Typography>
    </ButtonBase>
  );
}

function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();

  const value = getNavValue(location.pathname);

  // Hide on editor and auth pages — those occupy full screen
  const shouldHide =
    location.pathname.startsWith('/notes/new') ||
    (location.pathname.startsWith('/notes/') && location.pathname !== '/notes') ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register');

  if (shouldHide) return null;

  return (
    <Portal>
      <Paper
        elevation={0}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.modal - 1,
          // hairline top border — no shadow
          borderTop: `1px solid ${theme.palette.divider}`,
          borderRadius: 0,
          // bg from MuiPaper override — background.paper
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <Box
          component="nav"
          aria-label="mobile navigation"
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            height: 56,
          }}
        >
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.value}
              item={item}
              isActive={value === item.value}
              onClick={() => navigate(item.path)}
            />
          ))}
        </Box>
      </Paper>
    </Portal>
  );
}

export default MobileBottomNav;
