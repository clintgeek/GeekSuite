import React, { useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { GeekBottomNav } from '@geeksuite/ui';
import NewNoteSheet from './new/NewNoteSheet';
import { graphiteTokens } from '../theme/tokens';

function getNavValue(pathname) {
  if (pathname.startsWith('/search'))                                     return 'search';
  if (pathname === '/')                                                    return 'home';
  if (pathname.startsWith('/notes') || pathname.startsWith('/tags/'))     return 'notes';
  // Archived is reached from the Notes page's Tags sheet; it belongs there.
  if (pathname.startsWith('/archived'))                                   return 'notes';
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
 * The icon, on a pill of highlighter when its tab is the current page — the
 * phone's one active mark. New is an action, never "current", so it only
 * ever wears the pill's outline.
 */
function TabIcon({ active, children, action = false }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 28,
        borderRadius: '999px',
        bgcolor: active ? g.hl : 'transparent',
        color: active ? g.onHl : 'inherit',
        border: action ? `1.5px solid ${g.ink2}` : '1.5px solid transparent',
      }}
    >
      {children}
    </Box>
  );
}

/**
 * MobileBottomNav — the phone's one set of paths: Home, Search, New, Notes.
 * Search lives only here on a phone (the top bar has no search icon), and
 * there is no hamburger duplicating Notes. New opens the New sheet (a note,
 * a photo, a sketch; code and mind map under More).
 *
 * `GeekShell`'s `bottomNav` slot renders it in normal flow at the foot of
 * the shell, and `GeekAppFrame` insets the content for it; `Layout` only
 * mounts it on mobile, so there is nothing to hide by breakpoint here, only
 * by route.
 */
function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);

  if (shouldHide(location.pathname)) return null;

  const value = getNavValue(location.pathname);
  const size = { fontSize: 21 };

  const items = [
    {
      id: 'home',
      label: 'Home',
      icon: <TabIcon active={value === 'home'}>{value === 'home' ? <HomeIcon sx={size} /> : <HomeOutlinedIcon sx={size} />}</TabIcon>,
      onClick: () => navigate('/'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: <TabIcon active={value === 'search'}>{value === 'search' ? <SearchIcon sx={size} /> : <SearchOutlinedIcon sx={size} />}</TabIcon>,
      onClick: () => navigate('/search'),
    },
    {
      id: 'new',
      label: 'New',
      icon: <TabIcon action><AddIcon sx={size} /></TabIcon>,
      onClick: () => setNewOpen(true),
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: <TabIcon active={value === 'notes'}>{value === 'notes' ? <AutoStoriesIcon sx={size} /> : <AutoStoriesOutlinedIcon sx={size} />}</TabIcon>,
      onClick: () => navigate('/notes'),
    },
  ];

  return (
    <>
      <GeekBottomNav
        items={items}
        activeId={value}
        labelSx={{ fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: 0 }}
        itemSx={{ color: 'text.secondary', '&[aria-current="page"]': { color: 'text.primary' } }}
      />
      <NewNoteSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

export default MobileBottomNav;
