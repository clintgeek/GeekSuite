/**
 * BuJoGeek sidebar — Red Pen on the suite `GeekSidebar`.
 *
 * The same paper as the page, a hairline to its right, four rows. The active
 * row is ink, bold, with the red pen's margin bar. The wordmark is the icon's
 * mark (a done bullet with a red tick) and "bujogeek" in Inter Tight.
 *
 * The reminders switch stays in `extras`: it is the app's one push preference
 * and it has no other home now that Settings is out of the UI.
 */
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { GeekSidebar } from '@geeksuite/ui';
import usePushReminders from '../../hooks/usePushReminders';
import { chromeFor } from '../../theme/chrome';
import { PEN_FONT } from '../../theme/pen';
import { navSections, activeNavId } from './navConfig';

export const RemindersToggle = () => {
  const theme = useTheme();
  const chrome = chromeFor(theme.palette.mode);
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
                minHeight: 44,
                px: 3.5,
                borderRadius: '4px',
                color: on ? chrome.accent : chrome.textDisabled,
                '&.Mui-disabled': { opacity: 1, color: chrome.textDisabled },
                '&:hover': { backgroundColor: chrome.bgHover, color: on ? chrome.accent : chrome.text },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                <Icon size={16} strokeWidth={1.75} />
              </ListItemIcon>
              <ListItemText primary={label} primaryTypographyProps={{ fontFamily: PEN_FONT, fontSize: '0.875rem', color: 'inherit' }} />
            </ListItemButton>
          </Box>
        </Tooltip>
      </ListItem>
    </List>
  );
};

/** The mark: an ink bullet with the red pen's tick (the app icon, drawn small). */
export const PenMark = ({ size = 26, chrome }) => (
  <Box component="svg" viewBox="0 0 32 32" width={size} height={size} aria-hidden sx={{ display: 'block', flexShrink: 0 }}>
    <circle cx="15" cy="17" r="11" fill={chrome.logo} />
    <path d="M9.5 16.5 L13.8 21 L26.5 6.5" fill="none" stroke={chrome.logoAccent} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </Box>
);

const Brand = ({ chrome }) => (
  <Box component={RouterLink} to="/today" aria-label="BuJoGeek, Today" sx={{ display: 'flex', alignItems: 'center', gap: 2.5, color: 'inherit', textDecoration: 'none' }}>
    <PenMark chrome={chrome} />
    <Typography sx={{ fontFamily: PEN_FONT, fontWeight: 700, color: chrome.logo, fontSize: '1.125rem', letterSpacing: '-0.03em', lineHeight: 1 }}>
      bujogeek
    </Typography>
  </Box>
);

const Sidebar = () => {
  const theme = useTheme();
  const chrome = chromeFor(theme.palette.mode);
  const location = useLocation();
  const currentId = activeNavId(location.pathname);

  const sections = navSections.map((section) => ({
    label: section.label,
    items: section.items.map(({ Icon, ...item }) => ({
      ...item,
      icon: <Icon size={18} strokeWidth={item.id === currentId ? 2.25 : 1.75} />,
    })),
  }));

  return (
    <GeekSidebar
      brand={<Brand chrome={chrome} />}
      sections={sections}
      activeId={currentId}
      extras={<RemindersToggle />}
      sx={{ bgcolor: chrome.bg, borderRight: `1px solid ${chrome.border}` }}
      brandSx={{ height: 64, minHeight: 64, px: 4.5, borderBottom: 'none' }}
      itemSx={{
        minHeight: 44,
        px: 3.5,
        borderRadius: '4px',
        color: chrome.textMuted,
        '& .MuiListItemIcon-root': { color: 'inherit' },
        '& .MuiListItemText-primary': { fontFamily: PEN_FONT, fontSize: '0.9375rem', fontWeight: 500 },
        '&:hover': { backgroundColor: chrome.bgHover, color: chrome.textHover },
        '&.Mui-selected': {
          backgroundColor: chrome.active,
          color: chrome.text,
          boxShadow: `inset 3px 0 0 ${chrome.accent}`,
          '& .MuiListItemText-primary': { fontWeight: 700 },
          '&:hover': { backgroundColor: chrome.active },
        },
      }}
    />
  );
};

export default Sidebar;
