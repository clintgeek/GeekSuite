/**
 * TodoGeek top bar — suite grammar via `GeekTopBar`, in Red Pen: paper, a
 * hairline, the view's name in ink. The account menu has no Settings row any
 * more (Settings is out of the UI; theme is the toggle here, reminders the
 * switch in the sidebar).
 */
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Bell, BellOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { GeekTopBar } from '@geeksuite/ui';
import { useThemeMode } from '@geeksuite/user';
import { useAuth } from '../../context/AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../../utils/userDisplay';
import { penOf, PEN_FONT } from '../../theme/pen';
import usePushReminders from '../../hooks/usePushReminders';
import { pageTitle } from './navConfig';

const TopBar = () => {
  const theme = useTheme();
  const p = penOf(theme);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme: themeMode, toggleTheme } = useThemeMode();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const reminders = usePushReminders();

  // Reminders live in the account menu as well as the sidebar: on a phone the
  // sidebar is behind the hamburger, a long way from where Chef looks for it
  // (3.26). Hidden when the browser cannot do push; blocked is said, not offered.
  const remindersItem = ['on', 'off', 'denied'].includes(reminders.status) ? [{
    id: 'reminders',
    label: reminders.status === 'on' ? 'Reminders: on' : reminders.status === 'denied' ? 'Reminders: blocked in browser settings' : 'Reminders: off',
    icon: reminders.status === 'on' ? <Bell size={16} strokeWidth={1.75} /> : <BellOff size={16} strokeWidth={1.75} />,
    onClick: () => { if (reminders.status !== 'denied' && !reminders.busy) reminders.toggle(); },
  }] : [];

  return (
    <GeekTopBar
      // On a phone the page's own heading is right under the bar: the bar says the app.
      title={phone ? 'TodoGeek' : pageTitle(location.pathname)}
      themeMode={themeMode}
      onThemeToggle={toggleTheme}
      currentApp="todogeek"
      account={
        isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
              extraItems: remindersItem,
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
