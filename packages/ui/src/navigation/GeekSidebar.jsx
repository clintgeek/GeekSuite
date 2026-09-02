/**
 * GeekSidebar — the sidebar content panel.
 *
 * This is *content*, not chrome: `GeekShell` decides whether it sits in a
 * permanent 220px column (md+) or inside a temporary drawer (below md), so this
 * component only fills the height it is given. It closes the mobile drawer on
 * navigate through the shell context, with no wiring in the app.
 *
 * Layout, top to bottom, and the order is not negotiable:
 *   brand block (60px) → grouped nav (scrolls) → `extras` → footer:
 *   user chip → Settings → Sign out.
 *
 * Identity — fonts, always-dark chrome, density — is the app's business: pass
 * `sx` (whole panel), `chromeSx` (brand + footer bands) and `itemSx` (rows).
 *
 * Legacy: the pre-2026-09 API (`appName`, flat `items`, a `footer` *element*,
 * `variant="permanent" | "temporary"` with `mobileOpen`/`onMobileClose`) still
 * works — `variant` renders the old Drawer wrapper. No app used it; it is kept
 * only so an in-flight branch cannot break. Default `variant` is now
 * `"content"`, which renders no Drawer.
 */
import { forwardRef, isValidElement } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { geekLayout, geekShape } from '../designTokens.js';
import { initialsFrom } from './navUtils.js';
import { useGeekShell } from './shellContext.js';

/** Inline SVG only: @mui/icons-material is not a peer dependency here. */
function Glyph({ children, size = 18 }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      {children}
    </Box>
  );
}

function SettingsGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.75v2.1M12 19.15v2.1M4.5 4.5l1.5 1.5M18 18l1.5 1.5M2.75 12h2.1M19.15 12h2.1M4.5 19.5 6 18M18 6l1.5-1.5" />
    </Glyph>
  );
}

function SignOutGlyph() {
  return (
    <Glyph>
      <path d="M15.5 8.5V6.75A1.75 1.75 0 0 0 13.75 5h-6A1.75 1.75 0 0 0 6 6.75v10.5A1.75 1.75 0 0 0 7.75 19h6a1.75 1.75 0 0 0 1.75-1.75V15.5" />
      <path d="M11 12h9m0 0-2.75-2.75M20 12l-2.75 2.75" />
    </Glyph>
  );
}

function normalizeSections({ sections, items }) {
  if (Array.isArray(sections) && sections.length) {
    // A flat array of items is accepted as a single unlabeled section.
    if (sections[0]?.items) return sections;
    return [{ items: sections }];
  }
  if (Array.isArray(items) && items.length) return [{ items }];
  return [];
}

function linkPropsFor(item) {
  if (item.to) return { component: RouterLink, to: item.to };
  if (item.href) return { component: 'a', href: item.href };
  return {};
}

function Badge({ value }) {
  // A count of zero is noise, not information.
  if (value == null || value === false || value === 0) return null;
  if (isValidElement(value)) return value;
  return (
    <Box
      component="span"
      sx={{
        ml: 1,
        px: 0.75,
        minWidth: 20,
        textAlign: 'center',
        borderRadius: `${geekShape.radius.chip}px`,
        fontSize: '0.6875rem',
        fontWeight: 600,
        lineHeight: '18px',
        color: 'primary.main',
        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
      }}
    >
      {value}
    </Box>
  );
}

export const GeekSidebar = forwardRef(function GeekSidebar(
  {
    brand,
    sections,
    items = [],
    activeId,
    onNavigate,
    extras,
    footer,
    sx,
    chromeSx,
    itemSx,
    // Legacy props — see the file header.
    appName,
    variant = 'content',
    mobileOpen = false,
    onMobileClose,
    ...props
  },
  ref
) {
  const { closeNav } = useGeekShell();
  const resolvedSections = normalizeSections({ sections, items });
  const resolvedBrand = brand ?? (appName ? { name: appName } : null);
  const legacyFooter = isValidElement(footer) ? footer : null;
  const footerSpec = legacyFooter ? null : footer;

  const handleNavigate = (item) => (event) => {
    item.onClick?.(event);
    onNavigate?.(item, event);
    closeNav();
  };

  const rowSx = {
    minHeight: geekLayout.minClickTarget,
    borderRadius: `${geekShape.radius.control}px`,
    px: 1.5,
    color: 'inherit',
    ...itemSx,
  };

  const brandBlock = (() => {
    if (!resolvedBrand) return null;
    if (isValidElement(resolvedBrand)) {
      return (
        <Box data-geek-sidebar="brand" sx={{ ...chromeSx }}>
          {resolvedBrand}
        </Box>
      );
    }

    const { monogram, name, tagline, to, href } = resolvedBrand;
    const inner = (
      <>
        {monogram ? (
          <Box
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${geekShape.radius.chip}px`,
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
              color: 'primary.main',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {monogram}
          </Box>
        ) : null}
        <Box sx={{ minWidth: 0, textAlign: 'left' }}>
          {name ? (
            <Typography variant="h3" noWrap sx={{ fontSize: '1.05rem' }}>
              {name}
            </Typography>
          ) : null}
          {tagline ? (
            <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
              {tagline}
            </Typography>
          ) : null}
        </Box>
      </>
    );

    const blockSx = {
      display: 'flex',
      alignItems: 'center',
      gap: 1.25,
      px: 2,
      width: '100%',
      minHeight: `${geekLayout.topBarHeight}px`,
      height: `${geekLayout.topBarHeight}px`,
      flexShrink: 0,
      color: 'inherit',
      textDecoration: 'none',
      ...chromeSx,
    };

    if (to || href) {
      return (
        <ButtonBase
          data-geek-sidebar="brand"
          {...(to ? { component: RouterLink, to } : { component: 'a', href })}
          onClick={closeNav}
          sx={{ ...blockSx, justifyContent: 'flex-start' }}
        >
          {inner}
        </ButtonBase>
      );
    }
    return (
      <Box data-geek-sidebar="brand" sx={blockSx}>
        {inner}
      </Box>
    );
  })();

  const footerBlock = (() => {
    if (legacyFooter) {
      return (
        <Box data-geek-sidebar="footer" sx={{ p: 2, flexShrink: 0, ...chromeSx }}>
          {legacyFooter}
        </Box>
      );
    }
    if (!footerSpec) return null;

    const { user, settings, onSignOut, signOutLabel = 'Sign out', settingsLabel = 'Settings' } =
      footerSpec;

    return (
      <Box
        data-geek-sidebar="footer"
        sx={{
          flexShrink: 0,
          px: 1,
          py: 1,
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          ...chromeSx,
        }}
      >
        {/* Fixed order: user chip → Settings → Sign out. */}
        {user ? (
          <Box
            data-geek-nav-footer="user"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 1.5,
              py: 1,
              minHeight: geekLayout.minClickTarget,
            }}
          >
            <Avatar
              src={user.avatarUrl}
              alt=""
              sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}
            >
              {user.initials ?? initialsFrom(user.name)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                {user.name}
              </Typography>
              {user.secondary ? (
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ display: 'block', color: 'text.secondary' }}
                >
                  {user.secondary}
                </Typography>
              ) : null}
            </Box>
          </Box>
        ) : null}

        <List disablePadding>
          {settings ? (
            <ListItemButton
              data-geek-nav-footer="settings"
              {...(settings.to ? { component: RouterLink, to: settings.to } : {})}
              onClick={(event) => {
                settings.onClick?.(event);
                closeNav();
              }}
              sx={rowSx}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                <SettingsGlyph />
              </ListItemIcon>
              <ListItemText
                primary={settingsLabel}
                primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
              />
            </ListItemButton>
          ) : null}
          {onSignOut ? (
            <ListItemButton
              data-geek-nav-footer="signout"
              onClick={(event) => {
                closeNav();
                onSignOut(event);
              }}
              sx={rowSx}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                <SignOutGlyph />
              </ListItemIcon>
              <ListItemText
                primary={signOutLabel}
                primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
              />
            </ListItemButton>
          ) : null}
        </List>
      </Box>
    );
  })();

  // In the legacy Drawer variants `sx` targets the Drawer, as it always did;
  // in content mode it targets the panel itself.
  const isContentMode = variant !== 'temporary' && variant !== 'permanent';

  const content = (
    <Box
      data-geek-sidebar="panel"
      {...(isContentMode ? { ref, ...props } : null)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        ...(isContentMode ? sx : null),
      }}
    >
      {brandBlock}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {resolvedSections.map((section, index) => (
          <Box
            component="section"
            key={section.label ?? `section-${index}`}
            sx={{ pt: section.label ? 1.5 : index === 0 ? 1 : 0, pb: 0.5 }}
          >
            {section.label ? (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 2.5,
                  pb: 0.5,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                {section.label}
              </Typography>
            ) : null}
            <List disablePadding sx={{ px: 1 }}>
              {(section.items ?? []).map((item) => (
                <ListItemButton
                  key={item.id}
                  data-geek-nav-item={item.id}
                  selected={item.id === activeId}
                  disabled={item.disabled}
                  aria-current={item.id === activeId ? 'page' : undefined}
                  onClick={handleNavigate(item)}
                  sx={rowSx}
                  {...linkPropsFor(item)}
                >
                  {item.icon ? (
                    <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>{item.icon}</ListItemIcon>
                  ) : null}
                  <ListItemText
                    primary={item.label}
                    secondary={item.description}
                    primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                  />
                  <Badge value={item.badge} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>

      {extras ? (
        <Box data-geek-sidebar="extras" sx={{ flexShrink: 0, px: 1, py: 1 }}>
          {extras}
        </Box>
      ) : null}

      {footerBlock}
    </Box>
  );

  if (variant === 'temporary') {
    return (
      <Drawer
        ref={ref}
        open={mobileOpen}
        onClose={onMobileClose}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{ '& .MuiDrawer-paper': { width: geekLayout.sidebarWidth }, ...sx }}
        {...props}
      >
        {content}
      </Drawer>
    );
  }

  if (variant === 'permanent') {
    return (
      <Drawer
        ref={ref}
        variant="permanent"
        sx={{
          width: geekLayout.sidebarWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: geekLayout.sidebarWidth,
            boxSizing: 'border-box',
          },
          ...sx,
        }}
        {...props}
      >
        {content}
      </Drawer>
    );
  }

  return content;
});
