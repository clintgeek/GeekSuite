/**
 * BuJoGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → extras → user chip → Settings → Sign out)
 * belongs to the primitive; this file only supplies BuJoGeek's "analog soul,
 * digital spine" identity: the always-dark tobacco chrome, the 56px wordmark
 * block, the IBM Plex Mono section labels, and the accent active-bar.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `onClose`
 * plumbing here any more.
 */
import { Box, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { GeekSidebar } from '@geeksuite/ui';
import usePushReminders from '../../hooks/usePushReminders';
import { useAuth } from '../../context/AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../../utils/userDisplay';
import { colors } from '../../theme/colors';
import { navSections, activeNavId } from './navConfig';

// Chrome palette — dark tobacco, warm and grounded.
// Consistent between light/dark app modes so the sidebar is always a dark anchor.
export const chrome = {
  bg:           '#252018',  // deeper tobacco — more luxurious than before
  bgHover:      '#2E2820',
  active:       '#1E1B14',  // sunken active state
  border:       'rgba(255, 245, 220, 0.07)',
  text:         'rgba(255, 245, 220, 0.85)',
  textMuted:    'rgba(255, 245, 220, 0.38)',
  textDisabled: 'rgba(255, 245, 220, 0.5)',
  accent:       colors.primary[400],
  accentBg:     'rgba(96, 152, 204, 0.1)',
  danger:       'rgba(184, 60, 52, 0.75)',
  dangerBg:     'rgba(184, 60, 52, 0.08)',
  logo:         'rgba(255, 245, 220, 0.78)',
  logoAccent:   colors.primary[400],
  divider:      'rgba(255, 245, 220, 0.06)',
};

/**
 * The reminders toggle — the app's only push preference, so it lives in the
 * sidebar's `extras` slot next to the footer rather than justifying its own
 * nav row. Also surfaced on the Settings page, since it's a per-browser
 * global preference, not a per-page control.
 */
export const RemindersToggle = () => {
  const { status, busy, toggle } = usePushReminders();

  if (status === 'loading' || status === 'unsupported') return null;

  const on = status === 'on';
  const denied = status === 'denied';
  const Icon = on ? Bell : BellOff;

  const label = on ? 'Reminders on' : denied ? 'Reminders blocked' : 'Reminders off';
  const hint = denied
    ? 'Notifications are blocked for this site — allow them in your browser settings.'
    : on
      ? 'Tasks with a due time will notify you here. Click to turn off.'
      : 'Get a notification when a task with a due time comes up.';

  return (
    <List disablePadding>
      <ListItem disablePadding>
        <Tooltip title={hint} placement="right">
          <Box sx={{ width: '100%' }}>
            <ListItemButton
              onClick={denied || busy ? undefined : toggle}
              disabled={denied || busy}
              sx={{
                py:           0.875,
                px:           1.75,
                borderRadius: '6px',
                color:        on ? chrome.accent : chrome.textDisabled,
                transition:   'color 0.14s ease, background-color 0.14s ease',
                '&.Mui-disabled': { opacity: 1, color: chrome.textDisabled },
                '&:hover': {
                  backgroundColor: on ? chrome.accentBg : chrome.bgHover,
                  color:           on ? chrome.accent : chrome.text,
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}>
                <Icon size={15} strokeWidth={1.75} />
              </ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{
                  fontFamily: '"Source Sans 3", sans-serif',
                  fontSize:   '0.8125rem',
                  color:      'inherit',
                }}
              />
            </ListItemButton>
          </Box>
        </Tooltip>
      </ListItem>
    </List>
  );
};

/** Brand block — the "bujo|geek" wordmark, kept at its original 56px height via `brandSx`. */
const Brand = () => (
  <Box
    component={RouterLink}
    to="/today"
    sx={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}
  >
    <Box
      sx={{
        width:          26,
        height:         26,
        borderRadius:   '5px',
        border:         `1.5px solid ${chrome.logoAccent}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        mr:             1.25,
        flexShrink:     0,
        opacity:        0.9,
      }}
    >
      <Typography
        sx={{
          fontFamily:    '"IBM Plex Mono", monospace',
          fontSize:      '0.625rem',
          fontWeight:    700,
          color:         chrome.logoAccent,
          letterSpacing: '0.04em',
          lineHeight:    1,
        }}
      >
        BJ
      </Typography>
    </Box>
    <Typography
      sx={{
        fontFamily:    '"Source Sans 3", sans-serif',
        fontWeight:    300,
        color:         chrome.logo,
        fontSize:      '1.0625rem',
        letterSpacing: '-0.02em',
        lineHeight:    1,
      }}
    >
      bujo
      <Box component="span" sx={{ fontWeight: 700, color: chrome.logoAccent, letterSpacing: '-0.01em' }}>
        geek
      </Box>
    </Typography>
  </Box>
);

const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  // `GeekSidebar` has no router of its own — on the settings route (which has
  // no nav row) pass its default settings id explicitly so the footer
  // Settings row highlights, per the primitive's own contract.
  const currentId = location.pathname.startsWith('/settings')
    ? 'settings'
    : activeNavId(location.pathname);

  const sections = navSections.map((section) => ({
    label: section.label,
    items: section.items.map(({ Icon, ...item }) => ({
      ...item,
      icon: <Icon size={17} strokeWidth={item.id === currentId ? 2 : 1.75} />,
    })),
  }));

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={sections}
      activeId={currentId}
      extras={<RemindersToggle />}
      footer={{
        user: isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
            }
          : undefined,
        settings: { to: '/settings' },
        onSignOut: isAuthenticated ? logout : undefined,
      }}
      sx={{
        bgcolor: chrome.bg,
        // `component="section"` wraps only nav groups, not the footer band, so
        // this reaches the section labels ("Journal" / "Library") without
        // touching the footer's user-email caption.
        '& section .MuiTypography-caption': {
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.5625rem',
          fontWeight: 700,
          color: chrome.textDisabled,
        },
      }}
      brandSx={{ height: 56, minHeight: 56, px: 2.25, borderBottom: `1px solid ${chrome.border}` }}
      footerSx={{ borderTop: `1px solid ${chrome.divider}` }}
      itemSx={{
        mb:           0.125,
        px:           1.75,
        borderRadius: '6px',
        color:        chrome.textMuted,
        transition:   'color 0.14s ease, background-color 0.14s ease',
        '& .MuiListItemText-primary': {
          fontFamily:    '"Source Sans 3", sans-serif',
          fontSize:      '0.875rem',
        },
        '&:hover': {
          backgroundColor: chrome.bgHover,
          color:           'rgba(255, 245, 220, 0.72)',
        },
        '&.Mui-selected': {
          backgroundColor: chrome.active,
          color:           chrome.text,
          boxShadow:       `inset 3px 0 0 ${chrome.accent}`,
          '& .MuiListItemText-primary': { fontWeight: 600 },
          '& .MuiListItemIcon-root': { color: chrome.accent },
          '&:hover': { backgroundColor: chrome.active },
        },
      }}
    />
  );
};

export default Sidebar;
