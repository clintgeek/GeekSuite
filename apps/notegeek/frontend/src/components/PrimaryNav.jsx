import React, { useMemo, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import LocalOffer from '@mui/icons-material/LocalOffer';
import { GeekSheet, useGeekNavMode, useGeekNavSlots } from '@geeksuite/ui';
import NewNoteSheet from './new/NewNoteSheet';
import Sidebar, { TagsPanel } from './Sidebar';
import { graphiteTokens } from '../theme/tokens';

/**
 * NoteGeek's primary navigation — ONE items array, three surfaces
 * (`useGeekNavSlots`, tablet wave 2026-11-16):
 *
 *   phone   — the bottom bar: Home, Search, New, Notes (unchanged: Graphite's
 *             one set of paths; the tag tree opens from the Notes page)
 *   tablet  — the rail: the same four plus Tags, which opens the tag tree
 *             (with All notes, Archived, Recently deleted) in a sheet — the
 *             sidebar's contents, reachable without a sidebar
 *   desktop — the sidebar (Sidebar.jsx: brand, Home, the tag tree); New and
 *             search live in the top bar there (Header.jsx)
 *
 * New is an action on the bar and the rail (it opens the New sheet), never
 * "current"; Tags is an action on the rail.
 */

/** Which bar/rail item a path belongs to. The rail has Tags; the phone does not. */
export function navValueFor(pathname, { rail = false } = {}) {
  if (pathname.startsWith('/search')) return 'search';
  if (pathname === '/') return 'home';
  if (rail && (pathname.startsWith('/tags/') || pathname.startsWith('/archived') || pathname.startsWith('/deleted'))) {
    return 'tags';
  }
  if (pathname.startsWith('/notes') || pathname.startsWith('/tags/')) return 'notes';
  // Archived is reached from the Notes page's Tags sheet on a phone; it belongs there.
  if (pathname.startsWith('/archived')) return 'notes';
  return 'home';
}

/** The phone's bar hides on a single note and on the auth pages: those own the screen. */
export function hidesBottomBar(pathname) {
  return (
    pathname.startsWith('/notes/new') ||
    (pathname.startsWith('/notes/') && pathname !== '/notes') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register')
  );
}

/**
 * The icon, on a pill of highlighter when its item is the current page — the
 * one active mark, on the bar and the rail alike. New is an action, never
 * "current", so it only ever wears the pill's outline.
 */
function NavIcon({ active, children, action = false }) {
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

const ICON = { fontSize: 21 };

/**
 * The one items array. `rail` adds the Tags item (a rail has no sidebar to
 * hold the tree); everything else is shared.
 */
export function buildNavItems({ value, rail, navigate, onNew, onTags }) {
  const item = (id, label, Outline, Filled, onClick) => ({
    id,
    label,
    icon: (
      <NavIcon active={value === id}>
        {value === id ? <Filled sx={ICON} /> : <Outline sx={ICON} />}
      </NavIcon>
    ),
    onClick,
  });
  const items = [
    item('home', 'Home', HomeOutlinedIcon, HomeIcon, () => navigate('/')),
    item('search', 'Search', SearchOutlinedIcon, SearchIcon, () => navigate('/search')),
    {
      id: 'new',
      label: 'New',
      icon: <NavIcon action><AddIcon sx={ICON} /></NavIcon>,
      onClick: onNew,
    },
    item('notes', 'Notes', AutoStoriesOutlinedIcon, AutoStoriesIcon, () => navigate('/notes')),
  ];
  if (rail) items.push(item('tags', 'Tags', LocalOfferOutlined, LocalOffer, onTags));
  return items;
}

const labelSx = { fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: 0 };
const itemSx = { color: 'text.secondary', '&[aria-current="page"]': { color: 'text.primary' } };

/**
 * The slots for GeekShell plus the sheets the actions open. `hidden` drops
 * every surface (signed out). The phone's bar also stands down on a single
 * note, and the desktop sidebar when it is folded away (navStore).
 */
export function useNotePrimaryNav({ hidden = false, sidebarCollapsed = false } = {}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Mode first (useGeekNavSlots reads the same hook), so the items can carry
  // Tags on the rail only.
  const rail = useGeekNavMode() === 'rail';
  const value = navValueFor(pathname, { rail });

  const items = useMemo(
    () => buildNavItems({ value, rail, navigate, onNew: () => setNewOpen(true), onTags: () => setTagsOpen(true) }),
    [value, rail, navigate]
  );

  const { navMode, nav, rail: railEl, bottomNav } = useGeekNavSlots({
    items,
    activeId: value === 'new' ? undefined : value,
    sidebar: <Sidebar />,
    hidden,
    bottomNavProps: { labelSx, itemSx },
    railProps: {
      'aria-label': 'NoteGeek',
      labelSx,
      itemSx,
      // NavIcon carries the highlighter; the rail's own pill would double it.
      indicatorSx: { bgcolor: 'transparent' },
      sx: { bgcolor: 'background.paper' },
    },
  });

  const slots = {
    navMode,
    nav: navMode === 'sidebar' && !sidebarCollapsed ? nav : undefined,
    rail: railEl,
    bottomNav: navMode === 'bottom' && !hidesBottomBar(pathname) ? bottomNav : null,
  };

  const sheets = hidden ? null : (
    <>
      <NewNoteSheet open={newOpen} onClose={() => setNewOpen(false)} />
      {rail ? (
        <GeekSheet open={tagsOpen} onClose={() => setTagsOpen(false)} title="Tags" snap="full">
          <TagsPanel onNavigate={() => setTagsOpen(false)} />
        </GeekSheet>
      ) : null}
    </>
  );

  return { slots, sheets };
}
