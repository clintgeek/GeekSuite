/**
 * FitnessGeek top bar — route-derived title, mono date stamp, and the suite's
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
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'text.secondary',
            display: { xs: 'none', sm: 'block' },
          }}
        >
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
