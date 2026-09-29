import React, { useState, useRef } from 'react';
import {
  Box,
  InputBase,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '../theme/ThemeModeProvider.jsx';
import { graphiteTokens } from '../theme/tokens';
import NewNoteMenu from './new/NewNoteMenu';
import useAuthStore from '../store/authStore';
import useNoteStore from '../store/noteStore';
import useTagStore from '../store/tagStore';
import { pageTitle } from './navConfig';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';

/**
 * Header — thin identity wrapper around the suite `GeekTopBar`.
 *
 * Brand lives in the sidebar (`Sidebar`'s `Brand`); this carries a real,
 * route-derived page title, the desktop search box (`/` reaches it through
 * the suite's slash focus — GeekShell installs the listener and GeekTopBar
 * marks the search slot), desktop's New split button, and the account menu.
 *
 * One path each on a phone (Graphite, 2026-09-29): search is the tab bar's
 * Search tab, so there is no search icon up here; and there is no hamburger
 * (`leading={null}`) — the drawer only repeated the Notes tab, and the tag
 * tree it held now opens from the Notes page's Tags button. The phone bar
 * is the title and the suite cluster, and it tucks away while you write
 * (Layout.jsx).
 */
function Header() {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleMode } = useThemeMode();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { clearNotes } = useNoteStore();
  const { clearTags } = useTagStore();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef(null);

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
          a graphite border on the sheet. "/" shortcut hint in the pill.
          The pill keeps its 32px look; an outer padded wrapper (not the
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
            height: 32,
            borderRadius: '8px',
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.text.primary, 0.025),
            transition: 'all 150ms ease',
            '&:focus-within': {
              borderColor: g.ink,
              bgcolor: g.sheet,
            },
          }}
        >
          <SearchOutlinedIcon
            sx={{ fontSize: 15, color: 'text.secondary', mr: 0.75, flexShrink: 0 }}
          />
          <InputBase
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes…"
            inputProps={{ 'aria-label': 'search notes' }}
            sx={{
              flex: 1,
              fontSize: '0.8125rem',
              color: 'text.primary',
              '& .MuiInputBase-input': {
                py: 0,
                height: 'auto',
                '&::placeholder': { color: 'text.secondary', opacity: 1 },
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
                color: 'text.secondary',
                lineHeight: 1,
              }}
            >
              /
            </Box>
          </Box>
        </Box>
      </Box>

    </>
  );

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      leading={null}
      search={isMobile ? undefined : search}
      actions={<NewNoteMenu />}
      mobileActions={null}
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
