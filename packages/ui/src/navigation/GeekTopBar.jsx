/**
 * GeekTopBar — the 60px suite top bar.
 *
 * Left:  hamburger (mobile only, from the shell context) → title/context.
 * Right: app `actions`, then the fixed suite cluster
 *        theme toggle → app switcher → account avatar menu.
 *
 * The right cluster order is fixed on purpose: it is the one part of the chrome
 * that must not move between apps. Brand does not live here — it lives in the
 * sidebar's brand block.
 *
 * Legacy `showSuiteControls`, `settings`, `profile` and `appName` still work;
 * the legacy slots render after the cluster.
 */
import { forwardRef, useCallback, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { geekLayout, geekShape } from '../designTokens.js';
import { GeekAppSwitcher } from './GeekAppSwitcher.jsx';
import { GeekThemeToggle } from './GeekThemeToggle.jsx';
import { initialsFrom } from './navUtils.js';
import { useGeekShell } from './shellContext.js';

/** Inline SVG — @mui/icons-material is not a peer dependency of this package. */
function MenuGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: 20,
        height: 20,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
      }}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Box>
  );
}

function AccountMenu({ account }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleOpen = useCallback((event) => setAnchorEl(event.currentTarget), []);
  const handleClose = useCallback(() => setAnchorEl(null), []);

  const {
    name,
    secondary,
    avatarUrl,
    initials,
    onSettings,
    onSignOut,
    extraItems,
    settingsLabel = 'Settings',
    signOutLabel = 'Sign out',
    label = 'Account',
  } = account;

  const run = (fn) => (event) => {
    handleClose();
    fn?.(event);
  };

  return (
    <>
      <Tooltip title={name || label}>
        <IconButton
          data-geek-topbar="account"
          onClick={handleOpen}
          aria-label={label}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          sx={{
            color: 'inherit',
            minWidth: geekLayout.minClickTarget,
            minHeight: geekLayout.minClickTarget,
            borderRadius: `${geekShape.radius.control}px`,
          }}
        >
          <Avatar
            src={avatarUrl}
            alt=""
            sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.main' }}
          >
            {initials ?? initialsFrom(name)}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 200,
              borderRadius: `${geekShape.radius.panel}px`,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              backgroundImage: 'none',
            },
          },
        }}
      >
        {name || secondary ? (
          <Box sx={{ px: 2, py: 1 }}>
            {name ? (
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
            ) : null}
            {secondary ? (
              <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                {secondary}
              </Typography>
            ) : null}
          </Box>
        ) : null}
        {name || secondary ? <Divider /> : null}
        {extraItems}
        {onSettings ? (
          <MenuItem
            data-geek-topbar-menu="settings"
            onClick={run(onSettings)}
            sx={{ minHeight: geekLayout.minClickTarget }}
          >
            {settingsLabel}
          </MenuItem>
        ) : null}
        {onSignOut ? (
          <MenuItem
            data-geek-topbar-menu="signout"
            onClick={run(onSignOut)}
            sx={{ minHeight: geekLayout.minClickTarget }}
          >
            {signOutLabel}
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

export const GeekTopBar = forwardRef(function GeekTopBar(
  {
    appName,
    title,
    leading,
    menuLabel = 'Open navigation',
    search,
    actions,
    account,
    profile,
    settings,
    // Legacy opt-in for the suite cluster. Passing `onThemeToggle`/`currentApp`
    // now switches the relevant control on by itself.
    showSuiteControls = false,
    themeMode,
    onThemeToggle,
    currentApp,
    sx,
    ...props
  },
  ref
) {
  const { isMobile, hasNav, toggleNav, mobileOpen } = useGeekShell();

  const showThemeToggle = showSuiteControls || Boolean(onThemeToggle);
  const showSwitcher = showSuiteControls || Boolean(currentApp);

  // Default leading slot: a hamburger, below `md` only, and only when the shell
  // actually owns a nav panel to open.
  const resolvedLeading =
    leading !== undefined ? (
      leading
    ) : isMobile && hasNav ? (
      <IconButton
        data-geek-topbar="menu"
        onClick={toggleNav}
        aria-label={menuLabel}
        aria-expanded={mobileOpen ? 'true' : undefined}
        edge="start"
        sx={{
          color: 'inherit',
          minWidth: geekLayout.minClickTarget,
          minHeight: geekLayout.minClickTarget,
          borderRadius: `${geekShape.radius.control}px`,
        }}
      >
        <MenuGlyph />
      </IconButton>
    ) : null;

  return (
    <AppBar ref={ref} position="sticky" color="default" sx={sx} {...props}>
      <Toolbar
        disableGutters
        sx={{
          minHeight: `${geekLayout.topBarHeight}px !important`,
          px: 2,
          gap: 2,
        }}
      >
        {resolvedLeading}
        <Box sx={{ minWidth: 0, flex: search ? '0 1 auto' : 1 }}>
          {appName ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {appName}
            </Typography>
          ) : null}
          {typeof title === 'string' || typeof title === 'number' ? (
            <Typography variant="h3" noWrap data-geek-topbar="title">
              {title}
            </Typography>
          ) : (
            title ?? null
          )}
        </Box>
        {search ? <Box sx={{ flex: 1, minWidth: 160 }}>{search}</Box> : null}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            ml: 'auto',
          }}
        >
          {actions}
          {/* Fixed suite cluster: theme → switcher → account. */}
          {showThemeToggle ? (
            <GeekThemeToggle
              data-geek-topbar="theme"
              mode={themeMode}
              onToggle={onThemeToggle}
            />
          ) : null}
          {showSwitcher ? (
            <GeekAppSwitcher data-geek-topbar="switcher" currentApp={currentApp} />
          ) : null}
          {account ? <AccountMenu account={account} /> : null}
          {settings}
          {profile}
        </Box>
      </Toolbar>
    </AppBar>
  );
});
