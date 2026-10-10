/**
 * TodoGeek top bar — suite grammar via `GeekTopBar`, in Red Pen: paper, a
 * hairline, the view's name in ink. The account menu has no Settings row any
 * more (Settings is out of the UI; theme is the toggle here, reminders the
 * switch in the sidebar).
 */
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { useAuth } from '../../context/AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../../utils/userDisplay';
import { penOf, PEN_FONT } from '../../theme/pen';
import { pageTitle } from './navConfig';

const TopBar = () => {
  const theme = useTheme();
  const p = penOf(theme);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme: themeMode, toggleTheme } = useThemeMode();

  return (
    <GeekTopBar
      title={pageTitle(location.pathname)}
      themeMode={themeMode}
      onThemeToggle={toggleTheme}
      currentApp="todogeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              onSignOut: logout,
            }
          : undefined
      }
      sx={{
        backgroundColor: p.paper,
        borderBottom: `1px solid ${p.rule}`,
        boxShadow: 'none',
        color: 'text.primary',
        '& [data-geek-topbar="title"]': { fontFamily: PEN_FONT, fontWeight: 700, letterSpacing: '-0.02em' },
      }}
    />
  );
};

export default TopBar;
