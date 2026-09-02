import React from 'react';
import { useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { GeekBottomNav } from '@geeksuite/ui';

function getNavValue(pathname) {
  if (pathname.startsWith('/search'))                                     return 'search';
  if (pathname.startsWith('/notes/new'))                                  return 'new';
  if (pathname === '/')                                                    return 'home';
  if (pathname.startsWith('/notes') || pathname.startsWith('/tags/'))     return 'notes';
  return 'home';
}

/** Hide on editor and auth pages — those occupy full screen. */
function shouldHide(pathname) {
  return (
    pathname.startsWith('/notes/new') ||
    (pathname.startsWith('/notes/') && pathname !== '/notes') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register')
  );
}

/**
 * MobileBottomNav — thin wrapper around the suite `GeekBottomNav`.
 *
 * Same four items and hide rules as before, but no more `Portal` / fixed
 * positioning / safe-area padding of its own: `GeekShell`'s `bottomNav` slot
 * renders it in normal flow at the foot of the shell, and `GeekAppFrame`
 * insets the scrollable content by `geekLayout.bottomNavHeight` for it —
 * `Layout` only mounts this on mobile, so there's nothing to hide by
 * breakpoint here, only by route.
 */
function MobileBottomNav() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  if (shouldHide(location.pathname)) return null;

  const value = getNavValue(location.pathname);

  const items = [
    {
      id: 'home',
      label: 'Home',
      icon: value === 'home' ? <HomeIcon sx={{ fontSize: 20 }} /> : <HomeOutlinedIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate('/'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: value === 'search' ? <SearchIcon sx={{ fontSize: 20 }} /> : <SearchOutlinedIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate('/search'),
    },
    {
      id: 'new',
      label: 'New',
      icon: <AddOutlinedIcon sx={{ fontSize: 22 }} />,
      onClick: () => navigate('/notes/new'),
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: value === 'notes' ? <AutoStoriesIcon sx={{ fontSize: 20 }} /> : <AutoStoriesOutlinedIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate('/notes'),
    },
  ];

  return (
    <GeekBottomNav
      items={items}
      activeId={value}
      itemSx={{
        // Mono, uppercase, letterspaced labels — the same treatment every
        // other NoteGeek label gets, recreated since the primitive's label
        // typography isn't itself overridable per app.
        '& .MuiTypography-caption': {
          fontFamily: theme.typography.fontFamilyMono,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        },
        // Ink-stamp active indicator — a 3px top bar, same treatment the
        // bespoke bar used, recreated off the primitive's own `aria-current`.
        position: 'relative',
        '&[aria-current="page"]::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 32,
          height: 3,
          borderRadius: '0 0 3px 3px',
          bgcolor: 'primary.main',
        },
      }}
    />
  );
}

export default MobileBottomNav;
