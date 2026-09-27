/**
 * FitnessGeek top bar — route-derived title, the day in words, and the suite's
 * fixed right cluster (theme → switcher → account).
 *
 * Before this migration the left slot was empty and the avatar deep-linked
 * straight to /settings on desktop while opening a hand-rolled nav Menu on
 * mobile. Both are gone: the avatar is now a real account menu on every
 * width (Settings, Sign out), and the shell's own hamburger + drawer cover
 * mobile navigation.
 */
import { Typography } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { APP_NAME, pageTitle } from './navConfig.jsx';
import { displayNameFrom, initialsFrom, secondaryFrom } from './userDisplay.js';

const TopBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme: themeMode, toggleTheme } = useThemeMode();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      themeMode={themeMode}
      onThemeToggle={toggleTheme}
      currentApp={APP_NAME}
      actions={
        // The day in words, never abbreviated (plan item 8). Hidden on a
        // phone, where the page itself says "Today".
        <Typography
          sx={{
            fontSize: '1rem',
            fontWeight: 700,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            display: { xs: 'none', md: 'block' },
          }}
        >
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Typography>
      }
      account={{
        name: displayNameFrom(user),
        secondary: secondaryFrom(user),
        initials: initialsFrom(user),
        onSettings: () => navigate('/settings'),
        onSignOut: handleLogout,
      }}
    />
  );
};

export default TopBar;
