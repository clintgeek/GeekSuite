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
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/notes/new')) return 'new';
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/notes')) return 'notes';
  if (pathname.startsWith('/tags/')) return 'notes';
  return 'home';
}

const NAV_ITEMS = [
  { value: 'home', label: 'Home', icon: HomeOutlinedIcon, activeIcon: HomeIcon, path: '/' },
  { value: 'search', label: 'Search', icon: SearchOutlinedIcon, activeIcon: SearchIcon, path: '/search' },
  { value: 'new', label: 'New', icon: AddOutlinedIcon, activeIcon: AddOutlinedIcon, path: '/notes/new', accent: true },
  { value: 'notes', label: 'Notes', icon: AutoStoriesOutlinedIcon, activeIcon: AutoStoriesIcon, path: '/notes' },
];

function NavItem({ item, isActive, onClick }) {
  const Icon = isActive ? item.activeIcon : item.icon;

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        py: 0.75,
        gap: 0.25,
        position: 'relative',
      }}
    >
      {/* Active indicator — thinking accent */}
      {isActive && (
        <Box
          sx={{
            position: 'absolute',
            top: 2,
            width: 16,
            height: 2,
            borderRadius: 1,
            bgcolor: 'primary.main',
          }}
        />
      )}
      <Icon
        sx={{
          fontSize: item.accent ? 22 : 20,
          color: isActive ? 'primary.main' : 'text.disabled',
        }}
      />
      <Typography
        sx={{
          fontSize: '0.6rem',
          fontWeight: isActive ? 600 : 500,
          color: isActive ? 'primary.main' : 'text.disabled',
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
          borderTop: `1px solid ${theme.palette.divider}`,
          borderRadius: 0,
          bgcolor: 'background.paper',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            height: 52,
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
