/**
 * NewsGeek top bar (GeekShell's `topBar`): newsprint, a double rule under
 * it (thick over thin, the paper's column rule), the page name in the
 * headline serif. Phone: no hamburger — the tab bar is the navigation; a
 * source's page gets a back arrow. The avatar menu keeps theme and sign out.
 */
import React from 'react';
import { IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeMode } from '@geeksuite/user';
import { GeekTopBar } from '@geeksuite/ui';
import { SERIF } from '../theme/theme';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { APP_ID, isBackPath, titleFor } from './navConfig';

export default function TopBar({ user, onSignOut }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme: mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const onSubPage = isBackPath(location.pathname);
  const ink = theme.palette.text.primary;

  const goBack = () => {
    if (window.history.length > 1 && location.key !== 'default') navigate(-1);
    else navigate('/sources');
  };

  return (
    <GeekTopBar
      elevation={0}
      leading={
        isMobile && onSubPage ? (
          <IconButton data-geek-topbar="back" aria-label="Back" edge="start" onClick={goBack} sx={{ color: 'inherit' }}>
            <ArrowBackIcon />
          </IconButton>
        ) : null
      }
      title={
        <Typography variant="h3" component="div" noWrap data-geek-topbar="title" sx={{ minWidth: 0 }}>
          {titleFor(location.pathname)}
        </Typography>
      }
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp={APP_ID}
      account={user ? { name: displayNameFrom(user), secondary: secondaryFrom(user), initials: initialsFrom(user), onSignOut } : undefined}
      sx={{
        bgcolor: 'background.default',
        color: 'text.primary',
        borderBottom: 0,
        // Thick over thin: 2px ink, 2px paper, 1px ink.
        boxShadow: `inset 0 -1px 0 ${ink}, inset 0 -3px 0 ${theme.palette.background.default}, inset 0 -5px 0 ${ink}`,
        pb: '5px',
        '& [data-geek-topbar="title"]': { fontFamily: SERIF, fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.01em', lineHeight: 1.15 },
        '& [data-geek-topbar="account"] .MuiAvatar-root': { bgcolor: 'text.primary', color: 'background.default', fontWeight: 700 },
      }}
    />
  );
}
