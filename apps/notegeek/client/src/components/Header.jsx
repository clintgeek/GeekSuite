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
  useTheme,
  alpha,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Brightness4OutlinedIcon from '@mui/icons-material/Brightness4Outlined';
import Brightness7OutlinedIcon from '@mui/icons-material/Brightness7Outlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useNavigate } from 'react-router-dom';
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
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
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
      position="fixed"
      elevation={0}
      sx={{
        zIndex: theme.zIndex.drawer + 1,
        bgcolor: theme.palette.background.paper,
        color: 'text.primary',
        flexDirection: 'row',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Toolbar sx={{ px: { xs: 1, sm: 1.5 }, width: '100%', minHeight: { xs: 44, sm: 48 }, gap: 0.5 }}>
        {/* Menu button */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onMenuClick}
          size="small"
          sx={{
            p: 0.75,
            borderRadius: 1.5,
            transition: 'background 80ms ease',
            '&:hover': {
              bgcolor: alpha(theme.palette.text.primary, 0.06),
            },
          }}
        >
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* Brand — compact */}
        <ButtonBase
          onClick={() => navigate('/')}
          disableRipple
          sx={{
            px: 0.5,
            borderRadius: 1,
          }}
        >
          <Typography
            noWrap
            component="div"
            sx={{
              fontWeight: 800,
              fontSize: '0.875rem',
              letterSpacing: '-0.02em',
              userSelect: 'none',
              display: 'flex',
            }}
          >
            <Box component="span" sx={{ color: 'text.primary' }}>note</Box>
            <Box component="span" sx={{ color: 'primary.main' }}>geek</Box>
          </Typography>
        </ButtonBase>

        {/* Search — real input, desktop */}
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          ref={searchRef}
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            flex: 1,
            maxWidth: 360,
            mx: 2,
            px: 1.5,
            height: 32,
            borderRadius: 1.5,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.text.primary, 0.02),
            transition: 'all 150ms ease',
            '&:focus-within': {
              borderColor: theme.palette.primary.main,
              bgcolor: 'background.paper',
              boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
            },
          }}
        >
          <SearchOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled', mr: 1 }} />
          <InputBase
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            sx={{
              flex: 1,
              fontSize: '0.75rem',
              '& .MuiInputBase-input': { py: 0, height: 'auto' },
            }}
          />
          <Typography
            sx={{
              fontSize: '0.625rem',
              fontWeight: 600,
              color: 'text.disabled',
              fontFamily: '"JetBrains Mono", monospace',
              bgcolor: alpha(theme.palette.text.primary, 0.05),
              px: 0.5,
              borderRadius: 0.5,
              lineHeight: 1.6,
            }}
          >
            /
          </Typography>
        </Box>

        {/* Search icon — mobile */}
        <IconButton
          onClick={() => navigate('/search')}
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

        {/* Theme toggle */}
        <Tooltip title={isDark ? 'Light mode' : 'Dark mode'} arrow>
          <IconButton
            onClick={toggleMode}
            aria-label="toggle theme"
            size="small"
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              color: 'text.disabled',
              transition: 'color 100ms ease',
              '&:hover': {
                color: 'text.primary',
              },
            }}
          >
            {isDark ? (
              <Brightness7OutlinedIcon sx={{ fontSize: 18 }} />
            ) : (
              <Brightness4OutlinedIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

export default Header;