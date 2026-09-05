/**
 * BookGeek top bar — the old `Header.jsx`, moved inside the shell.
 *
 * `Header` was an `AppBar` rendered as a *sibling above* `GeekShell`, which is
 * why the sidebar started 60px down the page and why BookGeek had no mobile
 * hamburger to give one. This renders as `GeekShell topBar` instead, so the
 * sidebar column runs full height and `GeekTopBar` supplies the mobile
 * hamburger from the shell context.
 *
 * The brand moved to the sidebar's brand block; the left slot now carries the
 * page title. "Add book" is an app action, so it sits in `actions`, left of
 * the fixed suite cluster (theme → switcher → account) — on a phone it is the
 * `GeekFab` instead, so `mobileActions` gives that slot to search.
 *
 * Search (MOBILE_UI_PLAN.md §3.1) lives here at every size, not in the content
 * toolbar: the `search` slot on desktop, and a search icon on mobile that
 * swaps the title for a full-width field. Explicitly:
 *   - the mobile icon toggles the field open/closed; closing it (icon or Esc)
 *     keeps whatever was typed — the query stays live and shows as a chip
 *     under the toolbar;
 *   - the ✕ *inside* the field clears the query and keeps the field open.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, IconButton, InputAdornment, alpha, useMediaQuery, useTheme } from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useThemeMode } from '@geeksuite/user';
import { GeekSearchField, GeekTopBar } from '@geeksuite/ui';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { viewTitle } from './navConfig';

const TopBar = ({
  user,
  activeView,
  setActiveView,
  setAddBookOpen,
  onSignOut,
  searchQuery = '',
  setSearchQuery,
}) => {
  const theme = useTheme();
  const { theme: mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileFieldRef = useRef(null);

  // Leaving mobile with the field open would strand it in the desktop layout.
  useEffect(() => {
    if (!isMobile && searchOpen) setSearchOpen(false);
  }, [isMobile, searchOpen]);

  const searchField = (
    <GeekSearchField
      fullWidth
      placeholder="Search title / author / tag"
      value={searchQuery}
      onChange={(e) => setSearchQuery?.(e.target.value)}
      // `type="search"` brings WebKit's own clear glyph; ours is the one with
      // a 44px target and a label, so hide the native one.
      sx={{
        '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
        '& input[type="search"]::-webkit-search-decoration': { WebkitAppearance: 'none' }
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 18, color: 'text.muted' }} />
          </InputAdornment>
        ),
        endAdornment: searchQuery ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery?.('');
                mobileFieldRef.current?.focus();
              }}
              sx={{ minWidth: 32, minHeight: 32, p: 0.5 }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ) : null
      }}
    />
  );

  const mobileSearchOpen = isMobile && searchOpen;

  return (
    <GeekTopBar
      elevation={0}
      // Mobile, search open: the field takes the title slot and the hamburger
      // stands down so the field has room (the ✕ is the way back).
      leading={mobileSearchOpen ? null : undefined}
      title={
        mobileSearchOpen
          ? React.cloneElement(searchField, {
              autoFocus: true,
              inputRef: mobileFieldRef,
              onKeyDown: (e) => {
                // Esc closes; it does not clear. The ✕ clears.
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSearchOpen(false);
                }
              }
            })
          : viewTitle(activeView)
      }
      search={isMobile ? undefined : searchField}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp="bookgeek"
      actions={
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddBookOpen(true)}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            px: 2,
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' }
          }}
        >
          Add book
        </Button>
      }
      mobileActions={
        <IconButton
          data-geek-topbar="search"
          onClick={() => setSearchOpen((prev) => !prev)}
          aria-label={mobileSearchOpen ? 'Close search' : 'Search books'}
          aria-expanded={mobileSearchOpen ? 'true' : undefined}
          sx={{ color: 'inherit' }}
        >
          {mobileSearchOpen ? <ArrowBackIcon /> : <SearchIcon />}
        </IconButton>
      }
      account={
        user
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => setActiveView("profile"),
              onSignOut
            }
          : undefined
      }
      sx={{
        // BookGeek identity: flat paper band with a hairline rule, and the
        // serif wordmark's face on the page title.
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': {
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontWeight: 400,
          fontSize: '1.25rem',
          letterSpacing: '-0.02em'
        },
        '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"]': {
          color: 'text.primary',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
        }
      }}
    />
  );
};

export default TopBar;
