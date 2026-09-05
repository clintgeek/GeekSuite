import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  InputBase,
  useTheme,
  alpha,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '../theme/ThemeModeProvider.jsx';
import { glow } from '../theme/tokens';
import useAuthStore from '../store/authStore';
import useNoteStore from '../store/noteStore';
import useTagStore from '../store/tagStore';
import { pageTitle } from './navConfig';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';

/**
 * Header — thin identity wrapper around the suite `GeekTopBar`.
 *
 * Brand moved out to the sidebar (`Sidebar`'s `Brand`); this now carries a
 * real, route-derived page title, the search box (still with the `/`
 * shortcut and its own desktop/mobile forms), and the account menu that
 * used to have nowhere to live. The mobile hamburger comes from
 * `GeekTopBar`'s default leading slot — there is no local `onMenuClick`
 * plumbing any more.
 */
function Header() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleMode } = useThemeMode();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { clearNotes } = useNoteStore();
  const { clearTags } = useTagStore();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef(null);

  // Global keyboard shortcut: "/" focuses search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const handleLogout = () => {
    logout();
    clearNotes();
    clearTags();
    navigate('/login?signedOut=1');
  };

  const search = (
    <>
      {/* Search input — desktop. Small and unobtrusive at rest; on focus,
          primary border + glow.ring shadow. "/" shortcut hint in the pill.
          The pill keeps its 30px look; an outer padded wrapper (not the
          visual box) carries the 44px hit area, so tapping the padding
          around it still focuses the input. */}
      <Box
        onClick={() => searchRef.current?.querySelector('input')?.focus()}
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          minHeight: 44,
        }}
      >
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          ref={searchRef}
          sx={{
            display: 'flex',
            alignItems: 'center',
            maxWidth: 340,
            px: 1.25,
            height: 30,
            borderRadius: '6px',
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.text.primary, 0.025),
            transition: 'all 150ms ease',
            '&:focus-within': {
              borderColor: theme.palette.primary.main,
              bgcolor: theme.palette.background.paper,
              boxShadow: `0 0 0 3px ${glow(theme).ring}`,
            },
          }}
        >
          <SearchOutlinedIcon
            sx={{ fontSize: 13, color: 'text.disabled', mr: 0.75, flexShrink: 0 }}
          />
          <InputBase
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes…"
            inputProps={{ 'aria-label': 'search notes' }}
            sx={{
              flex: 1,
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.75rem',
              letterSpacing: '0.01em',
              color: 'text.primary',
              '& .MuiInputBase-input': {
                py: 0,
                height: 'auto',
                '&::placeholder': { color: 'text.disabled', opacity: 1 },
              },
            }}
          />
          {/* "/" shortcut hint pill */}
          <Box
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              ml: 0.5,
              px: 0.625,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: alpha(theme.palette.text.primary, 0.04),
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'text.disabled',
                lineHeight: 1,
              }}
            >
              /
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Search icon button — mobile only. 44px target: the icon stays
          visually small, but minWidth/minHeight keep the hit area honest
          even though `size="small"` shrinks the padding around it. */}
      <IconButton
        onClick={() => navigate('/search')}
        aria-label="search"
        size="small"
        sx={{
          display: { xs: 'flex', md: 'none' },
          p: 0.75,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 1.5,
          color: 'text.secondary',
        }}
      >
        <SearchOutlinedIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </>
  );

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      search={search}
      themeMode={mode}
      onThemeToggle={toggleMode}
      currentApp="notegeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => navigate('/settings'),
              onSignOut: handleLogout,
            }
          : undefined
      }
      sx={{
        // bg + bottom border come from MuiAppBar override in theme
        color: 'text.primary',
      }}
    />
  );
}

export default Header;
