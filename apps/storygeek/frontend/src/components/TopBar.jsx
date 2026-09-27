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
import { fonts } from '../theme/theme';

function TopBar() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme: mode, toggleTheme } = useThemeMode();
  const c = theme.palette.candle;

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
        // Candlelit Table identity: the table colour, a rule under it, Cinzel
        // for the page title and amber icon hovers (hover devices only).
        backgroundColor: alpha(c.table, 0.92),
        backgroundImage: 'none',
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: `1px solid ${c.rule}`,
        '& [data-geek-topbar="title"]': {
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: '1.05rem',
          letterSpacing: '0.05em',
        },
        '& .MuiIconButton-root': {
          color: 'text.secondary',
          '@media (hover: hover)': { '&:hover': { color: c.accent, backgroundColor: alpha(c.accent, 0.08) } },
        },
        '& .MuiAvatar-root': {
          bgcolor: c.mode === 'dark' ? c.accent : c.oxblood,
          color: c.mode === 'dark' ? '#1d1208' : '#f9f0dc',
          fontFamily: fonts.display,
          fontWeight: 700,
        },
      }}
    />
  );
}

export default TopBar;
