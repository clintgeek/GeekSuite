/**
 * GeekBottomNav — mobile tab bar for data-entry apps only.
 *
 * Rules from the shell grammar (TODO_ORDER #15a):
 *   - at most five items;
 *   - never a Logout/Sign out tab — account actions live in the sidebar footer
 *     and the top-bar account menu, and a logout item passed here is dropped;
 *   - 44px minimum targets, 56px bar (`geekLayout.bottomNavHeight`).
 *
 * Visibility is the app's call: pass `hidden` or render it conditionally.
 * `GeekShell` reserves space for it (via `bottomNav`) so `GeekAppFrame` can
 * inset its content.
 */
import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { geekLayout } from '../designTokens.js';
import { useGeekShell } from './shellContext.js';

export const GEEK_BOTTOM_NAV_MAX_ITEMS = 5;

const SIGN_OUT = /(^|[\s_-])(log|sign)[\s_-]?out([\s_-]|$)|^(logout|signout)$/i;

/** A tab bar is navigation, not a session control. Logout items are refused. */
function isSignOutItem(item) {
  return SIGN_OUT.test(String(item?.id ?? '')) || SIGN_OUT.test(String(item?.label ?? ''));
}

export const GeekBottomNav = forwardRef(function GeekBottomNav(
  { items = [], activeId, onNavigate, hidden = false, sx, itemSx, ...props },
  ref
) {
  const { closeNav } = useGeekShell();
  if (hidden) return null;

  const safeItems = items.filter((item) => !isSignOutItem(item)).slice(0, GEEK_BOTTOM_NAV_MAX_ITEMS);
  if (!safeItems.length) return null;

  return (
    <Box
      ref={ref}
      component="nav"
      data-geek-bottom-nav
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        height: `${geekLayout.bottomNavHeight}px`,
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
        ...sx,
      }}
      {...props}
    >
      {safeItems.map((item) => {
        const active = item.id === activeId;
        const linkProps = item.to
          ? { component: RouterLink, to: item.to }
          : item.href
            ? { component: 'a', href: item.href }
            : {};
        return (
          <ButtonBase
            key={item.id}
            data-geek-bottom-nav-item={item.id}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            disabled={item.disabled}
            onClick={(event) => {
              item.onClick?.(event);
              onNavigate?.(item, event);
              closeNav();
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: geekLayout.minClickTarget,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              px: 0.5,
              color: active ? 'primary.main' : 'text.secondary',
              textDecoration: 'none',
              ...itemSx,
            }}
            {...linkProps}
          >
            {item.icon ? <Box sx={{ display: 'flex' }}>{item.icon}</Box> : null}
            {item.label ? (
              <Typography
                variant="caption"
                noWrap
                sx={{ maxWidth: '100%', fontWeight: active ? 600 : 400, lineHeight: 1.2 }}
              >
                {item.label}
              </Typography>
            ) : null}
          </ButtonBase>
        );
      })}
    </Box>
  );
});
