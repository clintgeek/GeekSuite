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
 * The account menu itself is: user block → `extraItems` → `onAccount` (an
 * "Account" row, label via `accountLabel`) → `onSettings` → `onSignOut`.
 * `extraItems` accepts either a raw React node (rendered untouched, for
 * back-compat) or `{ id, label, icon?, onClick }` objects (or an array mixing
 * both) — the primitive wraps object-form `onClick` to close the menu first.
 *
 * Below the nav breakpoint the bar is *compact* (mobile grammar,
 * DOCS/MOBILE_UI_PLAN.md §2): hamburger → title → at most one app action →
 * switcher → avatar. Six 44px targets do not fit in 390px, so the theme toggle
 * folds into the account menu as a "Dark mode" / "Light mode" row (when there
 * is an account menu to fold into), and `actions` is reduced to its first
 * child unless the app passes `mobileActions` to choose what survives.
 *
 * Legacy `showSuiteControls`, `settings`, `profile` and `appName` still work;
 * the legacy slots render after the cluster.
 */
import { Children, forwardRef, isValidElement, useCallback, useState } from 'react';
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

/**
 * Normalizes `account.extraItems` into menu rows. Back-compat: a raw React
 * element (or array of them) renders untouched, exactly as it always has —
 * whatever click handling it carries is its own business. A plain
 * `{ id, label, icon?, onClick }` object gets wrapped into a `MenuItem` whose
 * `onClick` closes the menu first, then runs the item's own handler.
 */
function renderExtraItems(extraItems, closeMenu) {
  if (extraItems == null || extraItems === false) return null;
  const list = Array.isArray(extraItems) ? extraItems : [extraItems];
  return list.map((entry, index) => {
    if (isValidElement(entry)) return entry;
    if (entry && typeof entry === 'object') {
      const { id, label: itemLabel, icon, onClick } = entry;
      return (
        <MenuItem
          key={id ?? index}
          data-geek-topbar-menu={id ?? `extra-${index}`}
          onClick={(event) => {
            closeMenu();
            onClick?.(event);
          }}
          sx={{ minHeight: geekLayout.minClickTarget }}
        >
          {icon ? (
            <Box component="span" sx={{ display: 'inline-flex', mr: 1.5 }}>
              {icon}
            </Box>
          ) : null}
          {itemLabel}
        </MenuItem>
      );
    }
    return entry;
  });
}

/** Sun / moon glyphs for the folded theme row; mirrors GeekThemeToggle. */
function ThemeGlyph({ dark }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: 18,
        height: 18,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4.25" />
          <path d="M12 2.5v2.25M12 19.25v2.25M4.22 4.22l1.6 1.6M18.18 18.18l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.22 19.78l1.6-1.6M18.18 5.82l1.6-1.6" />
        </>
      ) : (
        <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />
      )}
    </Box>
  );
}

function AccountMenu({ account, themeRow }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleOpen = useCallback((event) => setAnchorEl(event.currentTarget), []);
  const handleClose = useCallback(() => setAnchorEl(null), []);

  const {
    name,
    secondary,
    avatarUrl,
    initials,
    onAccount,
    onSettings,
    onSignOut,
    extraItems,
    accountLabel = 'Account',
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
        // Kept mounted (hidden, not unmounted) so its content — including
        // `onAccount` / `extraItems` — is present in static markup for SSR
        // and crawler-style assertions, same as the Drawers elsewhere in this
        // package (`ModalProps={{ keepMounted: true }}`). MUI's Modal portals
        // into `document.body` by default, which does not exist under a
        // `node` SSR render (these apps are all client-only SPAs — never
        // hydrated — so skipping the portal only in that environment carries
        // no runtime risk); disable the portal only when there is nowhere to
        // portal into.
        keepMounted
        disablePortal={typeof document === 'undefined'}
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
        {themeRow ? (
          <MenuItem
            data-geek-topbar-menu="theme"
            onClick={run(themeRow.onToggle)}
            sx={{ minHeight: geekLayout.minClickTarget }}
          >
            <Box component="span" sx={{ display: 'inline-flex', mr: 1.5 }}>
              <ThemeGlyph dark={themeRow.mode === 'dark'} />
            </Box>
            {themeRow.mode === 'dark' ? 'Light mode' : 'Dark mode'}
          </MenuItem>
        ) : null}
        {renderExtraItems(extraItems, handleClose)}
        {onAccount ? (
          <MenuItem
            data-geek-topbar-menu="account"
            onClick={run(onAccount)}
            sx={{ minHeight: geekLayout.minClickTarget }}
          >
            {accountLabel}
          </MenuItem>
        ) : null}
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
    // What survives of `actions` below the nav breakpoint. Defaults to the
    // first child of `actions`; pass `null` to show none on mobile.
    mobileActions,
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

  const hasThemeToggle = showSuiteControls || Boolean(onThemeToggle);
  const showSwitcher = showSuiteControls || Boolean(currentApp);

  // Compact cluster below the nav breakpoint: the theme toggle folds into the
  // account menu when there is one; without an account menu it stays visible
  // (a control must not vanish with nowhere to go).
  const foldTheme = isMobile && hasThemeToggle && Boolean(account) && Boolean(onThemeToggle);
  const showThemeToggle = hasThemeToggle && !foldTheme;
  const themeRow = foldTheme ? { mode: themeMode, onToggle: onThemeToggle } : null;

  const resolvedActions = (() => {
    if (!isMobile) return actions;
    if (mobileActions !== undefined) return mobileActions;
    const first = Children.toArray(actions)[0];
    return first ?? null;
  })();

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
    <AppBar
      ref={ref}
      position="sticky"
      color="default"
      // In a standalone PWA the bar runs under the status bar / notch; pad by
      // the top safe-area inset so the 60px toolbar starts below it.
      sx={{ paddingTop: 'env(safe-area-inset-top, 0px)', ...sx }}
      {...props}
    >
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
          {resolvedActions}
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
          {account ? <AccountMenu account={account} themeRow={themeRow} /> : null}
          {settings}
          {profile}
        </Box>
      </Toolbar>
    </AppBar>
  );
});
