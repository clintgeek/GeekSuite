/**
 * BuJoGeek top bar — suite grammar via `GeekTopBar`.
 *
 * Before this migration the left slot was empty (no page title) and the
 * avatar was inert, hidden on mobile. Now the left carries a real,
 * route-derived title and the avatar is a real account menu (Settings, Sign
 * out) on every width — the shell's own hamburger covers mobile nav access,
 * so there is no bespoke `onMenuClick` plumbing here any more.
 */
import { alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { useAuth } from '../../context/AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../../utils/userDisplay';
import { colors } from '../../theme/colors';
import { pageTitle } from './navConfig';

const TopBar = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme: themeMode, toggleTheme } = useThemeMode();

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      themeMode={themeMode}
      onThemeToggle={toggleTheme}
      currentApp="bujogeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSettings: () => navigate('/settings'),
              onSignOut: logout,
            }
          : undefined
      }
      sx={{
        backgroundColor: alpha(theme.palette.background.paper, 0.96),
        borderBottom: `1px dotted ${isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200]}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': {
          fontFamily: '"Fraunces", serif',
          fontWeight: 500,
        },
      }}
    />
  );
};

export default TopBar;
