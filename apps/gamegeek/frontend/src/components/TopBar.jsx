/**
 * GameGeek top bar, rendered as GeekShell's `topBar`.
 *
 * Search lives here at every size (the desktop `search` slot; a toggle on a
 * phone that swaps the title for a full-width field), typing is debounced
 * into the URL's `q`, and it only exists on the library — Settings has
 * nothing to search. "Add game" is a desktop action; the phone has the FAB.
 *
 * `/` (suite slash focus) lands in the library search — priority 20, the
 * library's most important box. GeekSearchField marks itself and shows the
 * `/` keycap while the field is empty.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, IconButton, InputAdornment, alpha, useMediaQuery, useTheme } from '@mui/material';
import { Add as AddIcon, ArrowBack as ArrowBackIcon, Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeMode } from '@geeksuite/user';
import { GeekSearchField, GeekTopBar } from '@geeksuite/ui';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { DISPLAY_FONT, DISPLAY_WEIGHT } from '../theme/theme';
import { writeLibraryState } from '../utils/libraryFilter';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_ID, isLibraryPath, titleFor } from './navConfig';

export default function TopBar({ user, onSignOut }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { theme: mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const onLibrary = isLibraryPath(location.pathname);

  const urlQ = params.get('q') || '';
  const [text, setText] = useState(urlQ);
  const [searchOpen, setSearchOpen] = useState(Boolean(urlQ));
  const fieldRef = useRef(null);
  const lastWritten = useRef(urlQ);

  // The URL can change under us (a chip cleared, a sidebar link): follow it.
  useEffect(() => {
    if (urlQ !== lastWritten.current) {
      lastWritten.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    if (!isMobile && searchOpen && !text) setSearchOpen(false);
  }, [isMobile, searchOpen, text]);

  const pushQuery = useDebouncedCallback((value) => {
    lastWritten.current = value.trim() ? value : '';
    setParams((prev) => writeLibraryState(prev, { q: value }), { replace: true });
  }, 300);

  const onChange = (value) => {
    setText(value);
    pushQuery(value);
  };

  const clear = () => {
    setText('');
    pushQuery('');
    pushQuery.flush();
    fieldRef.current?.focus();
  };

  const field = (
    <GeekSearchField
      fullWidth
      placeholder="Search your games"
      slashFocus={20}
      value={text}
      inputRef={fieldRef}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ 'aria-label': 'Search your games' }}
      sx={{
        '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </InputAdornment>
        ),
        endAdornment: text ? (
          <InputAdornment position="end">
            <IconButton aria-label="Clear search" onClick={clear} sx={{ minWidth: 44, minHeight: 44, mr: -1 }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );

  const mobileSearch = isMobile && onLibrary && searchOpen;

  return (
    <GeekTopBar
      elevation={0}
      leading={mobileSearch ? null : undefined}
      title={
        mobileSearch
          ? React.cloneElement(field, {
              autoFocus: true,
              onKeyDown: (e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSearchOpen(false);
                }
              },
            })
          : titleFor(location.pathname)
      }
      search={!isMobile && onLibrary ? field : undefined}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp={APP_ID}
      actions={
        onLibrary ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate(`/add${location.search}`)}
            sx={{ fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, letterSpacing: '0.03em', px: 2, whiteSpace: 'nowrap' }}
          >
            Add game
          </Button>
        ) : null
      }
      mobileActions={
        onLibrary ? (
          <IconButton
            data-geek-topbar="search"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={mobileSearch ? 'Close search' : 'Search games'}
            aria-expanded={mobileSearch ? 'true' : 'false'}
            sx={{ color: 'inherit' }}
          >
            {mobileSearch ? <ArrowBackIcon /> : <SearchIcon />}
          </IconButton>
        ) : null
      }
      account={
        user
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => navigate('/settings'),
              onSignOut,
            }
          : undefined
      }
      sx={{
        backgroundColor: theme.palette.background.paper,
        borderBottom: `2px solid ${theme.palette.border}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': {
          fontFamily: DISPLAY_FONT,
          fontWeight: DISPLAY_WEIGHT,
          fontSize: '1.25rem',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        },
        '& [data-geek-topbar="theme"], & [data-geek-topbar="switcher"]': {
          color: 'text.primary',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
        },
      }}
    />
  );
}
