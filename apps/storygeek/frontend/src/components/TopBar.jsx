/**
 * StoryGeek top bar — parchment band, route-derived title.
 *
 * The brand moved out of here into the sidebar's brand block, so the left side
 * now says where you are instead of what app you are in. The right cluster is
 * the suite's fixed order (theme → switcher → account) and comes from the
 * primitive rather than three hand-mounted controls.
 *
 * Theme mode is read straight from `@geeksuite/user` here; it used to be
 * threaded down from App.jsx as `isDarkMode` / `onThemeToggle` props.
 */
import { alpha, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useAuth } from '@geeksuite/auth';
import { useThemeMode } from '@geeksuite/user';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { pageTitle } from './navConfig';

function TopBar() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme: mode, toggleTheme } = useThemeMode();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <GeekTopBar
      elevation={0}
      title={pageTitle(location.pathname)}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp="storygeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => navigate('/settings'),
              onSignOut: handleSignOut,
              signOutLabel: 'Depart',
            }
          : undefined
      }
      sx={{
        // Arcane Codex identity: the parchment/leather gradient band, a gold
        // hairline under it, Cinzel for the page title and gold icon hovers.
        background:
          theme.palette.mode === 'dark'
            ? `linear-gradient(90deg, ${alpha('#1a1614', 0.95)} 0%, ${alpha('#2a2420', 0.95)} 100%)`
            : `linear-gradient(90deg, ${alpha('#fff8ef', 0.95)} 0%, ${alpha('#f4ece1', 0.95)} 100%)`,
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: `1px solid ${alpha(gold, 0.15)}`,
        '& [data-geek-topbar="title"]': {
          fontFamily: '"Cinzel", serif',
          fontWeight: 600,
          fontSize: '1rem',
          letterSpacing: '0.04em',
        },
        '& .MuiIconButton-root': {
          color: 'text.secondary',
          '&:hover': { color: gold, backgroundColor: alpha(gold, 0.08) },
        },
        '& .MuiAvatar-root': {
          bgcolor: alpha(gold, 0.15),
          color: gold,
          fontFamily: '"Cinzel", serif',
          fontWeight: 700,
        },
      }}
    />
  );
}

export default TopBar;
