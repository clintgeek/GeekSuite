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
 * `sx` (whole panel), `chromeSx` (brand + footer bands), `brandSx` / `footerSx`
 * (merged over `chromeSx`, for that band only), `itemSx` (rows) and
 * `sectionLabelSx` (section captions, hook: `data-geek-sidebar="section-label"`).
 * A node `brand` gets the same 60px block sizing as the
 * `{ monogram, name, tagline }` form and closes the mobile drawer on click,
 * same as a linked object-form brand; on that object form,
 * `brand.monogramSx` merges last onto the monogram chip (hook:
 * `data-geek-sidebar="monogram"`).
 *
 * `footer.settings` renders selected when `settings.selected === true`, or
 * when `activeId` equals `settings.to` or `settings.id` (default `'settings'`)
 * — the sidebar has no router, so apps should pass `activeId="settings"` on
 * the settings route. `footer.user` renders as a plain chip unless it carries
 * `to` / `href` / `onClick`, in which case it becomes a `ButtonBase` (same
 * layout, 44px target) that navigates and closes the mobile drawer.
 *
 * `extras` follows the nav sections directly (nothing is pinned to the bottom;
 * the panel) so a tall extras block scrolls in place instead of squeezing the
 * nav list; override with `extrasSx`. When `extras` is the point of the panel
 * (a tag tree, say) rather than a footnote to the nav list, pass `extrasGrow`
 * to flip the priority: extras becomes the `flex: 1` scroll body and the nav
 * sections shrink to content (`flex: '0 0 auto'`) instead. Item `badge`
 * accepts a string as-is, a node, or a number — a `0` is suppressed unless
 * `badgeProps.showZero` is set; `badgeProps` otherwise passes through to the
 * badge's `Box` (sx merges last).
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

function Badge({ value, badgeProps }) {
  const { showZero = false, sx: badgeSx, ...restBadgeProps } = badgeProps ?? {};
  // A count of zero is noise, not information — unless the caller opts in via
  // `badgeProps.showZero`, e.g. to distinguish "checked, zero found" from "not
  // checked yet". Strings and nodes are always accepted as-is.
  if (value == null || value === false) return null;
  if (value === 0 && !showZero) return null;
  if (isValidElement(value)) return value;
  return (
    <Box
      component="span"
      data-geek-sidebar="badge"
      sx={{
        ml: 1,
        px: 0.75,
        minWidth: 20,
        textAlign: 'center',
        borderRadius: `${geekShape.radius.chip}px`,
        // 12px is the suite's text floor (MOBILE_UI_PLAN.md §2 "Text floor");
        // this badge used to render at 11px, the one place in the shell chrome
        // that broke it.
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: '18px',
        color: 'primary.main',
        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
        ...badgeSx,
      }}
      {...restBadgeProps}
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
    extrasSx,
    extrasGrow = false,
    footer,
    sx,
    chromeSx,
    brandSx,
    footerSx,
    itemSx,
    sectionLabelSx,
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

    // Same 60px block for both forms — a node brand still gets sized so apps
    // don't have to reproduce the height/padding/shrink themselves.
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
      ...brandSx,
    };

    if (isValidElement(resolvedBrand)) {
      // A node brand supplies its own link (or none at all); either way, any
      // click inside it should close the mobile drawer the same as the object
      // form's brand link does — bubbling makes this safe whether or not the
      // node is itself a link.
      return (
        <Box data-geek-sidebar="brand" onClick={closeNav} sx={blockSx}>
          {resolvedBrand}
        </Box>
      );
    }

    const { monogram, name, tagline, to, href, monogramSx } = resolvedBrand;
    const inner = (
      <>
        {monogram ? (
          <Box
            data-geek-sidebar="monogram"
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
              ...monogramSx,
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
        <Box data-geek-sidebar="footer" sx={{ p: 2, flexShrink: 0, ...chromeSx, ...footerSx }}>
          {legacyFooter}
        </Box>
      );
    }
    if (!footerSpec) return null;

    const { user, settings, onSignOut, signOutLabel = 'Sign out', settingsLabel = 'Settings' } =
      footerSpec;

    // The sidebar has no router awareness, so "selected" for Settings is decided
    // purely against `activeId`: either an explicit `settings.selected`, or
    // `activeId` matching `settings.to` or `settings.id` (default `'settings'`).
    // Apps that route to Settings should pass `activeId="settings"`.
    const settingsId = settings?.id ?? 'settings';
    const settingsSelected = settings
      ? settings.selected === true ||
        (settings.to != null && activeId === settings.to) ||
        activeId === settingsId
      : false;

    return (
      <Box
        data-geek-sidebar="footer"
        sx={{
          flexShrink: 0,
          px: 1,
          py: 1,
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          ...chromeSx,
          ...footerSx,
        }}
      >
        {/* Fixed order: user chip → Settings → Sign out. */}
        {user ? (() => {
          const userChipSx = {
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 1.5,
            py: 1,
            minHeight: geekLayout.minClickTarget,
          };
          const userInner = (
            <>
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
            </>
          );

          // `to` / `href` / `onClick` are all optional — only render the chip
          // as an interactive control when the app gives it somewhere to go.
          if (user.to || user.href || user.onClick) {
            return (
              <ButtonBase
                data-geek-nav-footer="user"
                {...(user.to
                  ? { component: RouterLink, to: user.to }
                  : user.href
                    ? { component: 'a', href: user.href }
                    : {})}
                onClick={(event) => {
                  user.onClick?.(event);
                  closeNav();
                }}
                sx={{
                  ...userChipSx,
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  color: 'inherit',
                  textDecoration: 'none',
                  borderRadius: `${geekShape.radius.control}px`,
                }}
              >
                {userInner}
              </ButtonBase>
            );
          }

          return (
            <Box data-geek-nav-footer="user" sx={userChipSx}>
              {userInner}
            </Box>
          );
        })() : null}

        <List disablePadding>
          {settings ? (
            <ListItemButton
              data-geek-nav-footer="settings"
              {...(settings.to ? { component: RouterLink, to: settings.to } : {})}
              selected={settingsSelected}
              aria-current={settingsSelected ? 'page' : undefined}
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

      {/* Everything floats to the top: nav sections first, then extras, in one
          scroll body. Nothing is pinned to the bottom (Chef, 2026-09-02). With
          `extrasGrow`, extras takes the remaining height and scrolls on its own. */}
      <Box
        data-geek-sidebar="body"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: extrasGrow ? 'hidden' : 'auto',
          overflowX: 'hidden',
        }}
      >
        <Box sx={{ flex: '0 0 auto' }}>
        {resolvedSections.map((section, index) => (
          <Box
            component="section"
            key={section.label ?? `section-${index}`}
            sx={{ pt: section.label ? 1.5 : index === 0 ? 1 : 0, pb: 0.5 }}
          >
            {section.label ? (
              <Typography
                variant="caption"
                data-geek-sidebar="section-label"
                sx={{
                  display: 'block',
                  px: 2.5,
                  pb: 0.5,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  ...sectionLabelSx,
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
                  <Badge value={item.badge} badgeProps={item.badgeProps} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
        </Box>

        {extras ? (
          <Box
            data-geek-sidebar="extras"
            sx={
              extrasGrow
                ? { flex: 1, minHeight: 0, overflowY: 'auto', px: 1, py: 1, ...extrasSx }
                : { flex: '0 0 auto', px: 1, py: 1, ...extrasSx }
            }
          >
            {extras}
          </Box>
        ) : null}
      </Box>

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
