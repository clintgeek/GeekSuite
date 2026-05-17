import React, { useState, useRef, useEffect } from 'react';
import {
  AppBar,
  Box,
  IconButton,
  Toolbar,
  Tooltip,
  Typography,
  InputBase,
  ButtonBase,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Brightness4OutlinedIcon from '@mui/icons-material/Brightness4Outlined';
import Brightness7OutlinedIcon from '@mui/icons-material/Brightness7Outlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useNavigate } from 'react-router-dom';
import { geekLayout } from '@geeksuite/ui';
import { useThemeMode } from '../theme/ThemeModeProvider.jsx';

function Header({ onMenuClick }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { mode, toggleMode } = useThemeMode();
  const isDark = mode === 'dark';
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

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        // bg + bottom border come from MuiAppBar override in theme
        color: 'text.primary',
      }}
    >
      <Toolbar
        sx={{
          px: { xs: 1, sm: 1.5 },
          width: '100%',
          minHeight: geekLayout.topBarHeight,
          gap: 0.5,
        }}
      >
        {/* Hamburger — compact, no distraction */}
        <IconButton
          color="inherit"
          aria-label="toggle navigation drawer"
          edge="start"
          onClick={onMenuClick}
          size="small"
          sx={{
            p: 0.75,
            borderRadius: 1.5,
            color: 'text.secondary',
            transition: 'color 80ms ease, background 80ms ease',
            '&:hover': {
              color: 'text.primary',
              bgcolor: alpha(theme.palette.text.primary, 0.05),
            },
          }}
        >
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* ——— Wordmark ——————————————————————————————————————————————
            Mono-uppercase with letterspacing. The two-color split (ink
            + oxblood) is the app's single strongest branding moment;
            keep it tight, no glyph decoration. "NOTE" in ink black,
            "GEEK" in primary oxblood.
        ——————————————————————————————————————————————————————————————— */}
        <ButtonBase
          onClick={() => navigate('/')}
          disableRipple
          aria-label="NoteGeek home"
          sx={{
            px: 0.75,
            borderRadius: 1,
            ml: 0.25,
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: 2,
            },
          }}
        >
          <Typography
            component="div"
            noWrap
            sx={{
              fontFamily: theme.typography.fontFamilyMono,
              fontWeight: 600,
              fontSize: { xs: '0.6875rem', sm: '0.75rem' },
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              userSelect: 'none',
              display: 'flex',
              lineHeight: 1,
            }}
          >
            <Box component="span" sx={{ color: 'text.primary' }}>
              Note
            </Box>
            <Box component="span" sx={{ color: 'primary.main' }}>
              Geek
            </Box>
          </Typography>
        </ButtonBase>

        {/* Hairline separator between wordmark and search — desktop only */}
        <Divider
          orientation="vertical"
          flexItem
          sx={{
            display: { xs: 'none', sm: 'block' },
            mx: 1,
            my: 1,
            borderColor: 'divider',
          }}
        />

        {/* ——— Search input — desktop ————————————————————————————————
            Small and unobtrusive at rest. On focus: primary border +
            glow.ring shadow. "/" shortcut hint visible in the pill.
        ——————————————————————————————————————————————————————————————— */}
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          ref={searchRef}
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            flex: 1,
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
              boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
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
              fontSize: '0.6875rem',
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
            <Typography
              sx={{
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: '0.5625rem',
                fontWeight: 600,
                color: 'text.disabled',
                lineHeight: 1,
              }}
            >
              /
            </Typography>
          </Box>
        </Box>

        {/* Search icon button — mobile only */}
        <IconButton
          onClick={() => navigate('/search')}
          aria-label="search"
          size="small"
          sx={{
            display: { xs: 'flex', sm: 'none' },
            p: 0.75,
            borderRadius: 1.5,
            color: 'text.secondary',
          }}
        >
          <SearchOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>

        <Box sx={{ flexGrow: 1 }} />

        {/* ——— Theme toggle — deliberately understated ——————————————
            Lives at the right edge. Muted at rest, readable on hover.
        ——————————————————————————————————————————————————————————————— */}
        <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} arrow>
          <IconButton
            onClick={toggleMode}
            aria-label={isDark ? 'switch to light mode' : 'switch to dark mode'}
            size="small"
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              color: 'text.disabled',
              transition: 'color 100ms ease, background 100ms ease',
              '&:hover': {
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.text.primary, 0.05),
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            {isDark ? (
              <Brightness7OutlinedIcon sx={{ fontSize: 17 }} />
            ) : (
              <Brightness4OutlinedIcon sx={{ fontSize: 17 }} />
            )}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
