/**
 * baseGeek top bar — new on desktop as of the shell-grammar migration.
 *
 * Before this, baseGeek had an AppBar on mobile only (hamburger + wordmark) and
 * nothing on desktop, which is why the theme toggle, app switcher and account
 * menu had nowhere to live. They live here now, in the suite's fixed
 * right-cluster order (theme → switcher → account); the mobile hamburger comes
 * from `GeekTopBar`'s default leading slot, and brand stays in the sidebar.
 */
import { MenuItem, useTheme } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { useBaseGeekAuth } from './AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { pageTitle } from './navConfig';

export default function TopBar() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useBaseGeekAuth();
  // Same suite-wide provider App.jsx builds the MUI theme from, so the toggle
  // drives the `geek_theme` cookie rather than a second local mode.
  const { theme: mode, toggleTheme } = useThemeMode();

  return (
    <GeekTopBar
      // PRIMITIVE GAP: `account.extraItems` receives no close handle, so an
      // extra menu item cannot dismiss the menu it lives in. Re-keying the bar
      // on the pathname unmounts the (stateless) cluster on navigate, which
      // closes it. Remove once the primitive passes `onClose`/`run` to extras.
      key={location.pathname}
      title={pageTitle(location.pathname)}
      themeMode={mode}
      onThemeToggle={toggleTheme}
      currentApp="basegeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              // Renders above Settings, giving Account → Settings → Sign out.
              extraItems: (
                <MenuItem
                  data-basegeek-menu="account"
                  onClick={() => navigate('/account')}
                  sx={{ minHeight: 44 }}
                >
                  Account
                </MenuItem>
              ),
              onSettings: () => navigate('/settings'),
              onSignOut: logout,
            }
          : undefined
      }
      sx={{
        // Mission Control identity: the base surface rather than paper, a
        // hairline panel rule, and a compact Geist page title instead of h3.
        bgcolor: 'background.default',
        backgroundImage: 'none',
        borderBottom: `1px solid ${theme.palette.line.panel}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': {
          fontSize: '1rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
        },
      }}
    />
  );
}
