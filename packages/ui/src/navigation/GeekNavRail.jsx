/**
 * GeekNavRail — the tablet's primary navigation (plan 2.6, D9, P2).
 *
 * A 72px vertical column on the left: icon with a short label under it, one
 * item per destination. It is what a tablet (600–1199 px wide, or a touch
 * tablet in either orientation — `useFormFactor().navMode === 'rail'`) gets
 * instead of the phone's bottom bar or the desktop's 220px sidebar.
 *
 * ONE items array serves all three. The item shape is GeekBottomNav's and
 * GeekSidebar's flat `items`: `{ id, label, icon, to | href | onClick,
 * disabled, badge }`. So a shell picks the surface and passes the same list:
 *
 *   const navMode = useGeekNavMode();
 *   <GeekShell
 *     nav={navMode === 'sidebar' ? <GeekSidebar items={items} activeId={id} … /> : undefined}
 *     rail={navMode === 'rail' ? <GeekNavRail items={items} activeId={id} /> : undefined}
 *     bottomNav={navMode === 'bottom' ? <GeekBottomNav items={items} activeId={id} /> : null}
 *   />
 *
 * Rules that are rules, not looks:
 *   - targets at least 48x48 (the item is 56 tall, the rail's full width);
 *   - the current item carries `aria-current="page"`;
 *   - every item is a real link or button, so Tab reaches it, and Up/Down
 *     move between items like a menu bar;
 *   - the rail pads itself for the safe-area insets (top, bottom, and left —
 *     a landscape notch), so the 72px of content is never under one;
 *   - a Logout/Sign out item is dropped, as in the bottom bar: account
 *     actions live in the top bar's account menu.
 *
 * Identity is the app's: `sx` (the column), `itemSx`, `labelSx`,
 * `indicatorSx` (the pill behind the current icon). Colours come from the
 * theme: `text.secondary` at rest, `primary.main` for the current item, the
 * pill an alpha of `primary.main`. `header` and `footer` are optional slots
 * at the top (a New button, the app mark) and pinned at the bottom.
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { geekInteraction, geekShape } from '../designTokens.js';
import { isSignOutItem, navLinkProps } from './navUtils.js';

/** Rail width before safe-area padding. */
export const GEEK_NAV_RAIL_WIDTH = 72;
/** Minimum target on the rail (Material's rail spec, above the suite's 44). */
export const GEEK_NAV_RAIL_MIN_TARGET = 48;

function moveFocus(event) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const list = event.currentTarget;
  const items = [...list.querySelectorAll('[data-geek-nav-rail-item]')].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
  );
  if (!items.length) return;
  const at = items.indexOf(event.target.closest?.('[data-geek-nav-rail-item]'));
  const next =
    event.key === 'ArrowDown'
      ? items[(at + 1 + items.length) % items.length]
      : items[(at - 1 + items.length) % items.length];
  event.preventDefault();
  next.focus();
}

export const GeekNavRail = forwardRef(function GeekNavRail(
  {
    items = [],
    activeId,
    onNavigate,
    header,
    footer,
    width = GEEK_NAV_RAIL_WIDTH,
    'aria-label': ariaLabel = 'Primary',
    hidden = false,
    sx,
    itemSx,
    labelSx,
    indicatorSx,
    ...props
  },
  ref
) {
  if (hidden) return null;
  const safeItems = items.filter((item) => item && !isSignOutItem(item));

  return (
    <Box
      ref={ref}
      component="nav"
      aria-label={ariaLabel}
      data-geek-nav-rail=""
      sx={{
        flexShrink: 0,
        width,
        boxSizing: 'content-box',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 1,
        paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        // calc() so every engine (and jsdom's CSSOM) keeps the declaration.
        paddingLeft: 'calc(0px + env(safe-area-inset-left, 0px))',
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
        overflowY: 'auto',
        overflowX: 'hidden',
        ...sx,
      }}
      {...props}
    >
      {header ? (
        <Box data-geek-nav-rail="header" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          {header}
        </Box>
      ) : null}
      <Box
        component="ul"
        role="list"
        data-geek-nav-rail="items"
        onKeyDown={moveFocus}
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        {safeItems.map((item) => {
          const active = item.id === activeId;
          return (
            <Box component="li" key={item.id} sx={{ display: 'flex', justifyContent: 'center' }}>
              <ButtonBase
                data-geek-nav-rail-item={item.id}
                aria-current={active ? 'page' : undefined}
                disabled={item.disabled}
                onClick={(event) => {
                  item.onClick?.(event);
                  onNavigate?.(item, event);
                }}
                sx={{
                  width: '100%',
                  minWidth: GEEK_NAV_RAIL_MIN_TARGET,
                  minHeight: 56,
                  px: 0.5,
                  py: 0.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  color: active ? 'primary.main' : 'text.secondary',
                  textDecoration: 'none',
                  borderRadius: `${geekShape.radius.control}px`,
                  '&.Mui-focusVisible': {
                    outline: (theme) =>
                      `${geekInteraction.focus.outlineWidth}px solid ${theme.palette.primary.main}`,
                    outlineOffset: -geekInteraction.focus.outlineWidth,
                  },
                  '&.Mui-disabled': { opacity: geekInteraction.disabledOpacity },
                  '@media (any-hover: hover)': {
                    '&:hover [data-geek-nav-rail="indicator"]': {
                      bgcolor: (theme) =>
                        alpha(
                          theme.palette.primary.main,
                          active ? geekInteraction.activeOpacity : geekInteraction.hoverOpacity * 2
                        ),
                    },
                  },
                  ...itemSx,
                }}
                {...navLinkProps(item)}
              >
                <Box
                  data-geek-nav-rail="indicator"
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 32,
                    borderRadius: 16,
                    bgcolor: (theme) =>
                      active ? alpha(theme.palette.primary.main, geekInteraction.activeOpacity) : 'transparent',
                    ...indicatorSx,
                  }}
                >
                  {item.icon ? (
                    <Box aria-hidden="true" sx={{ display: 'flex' }}>
                      {item.icon}
                    </Box>
                  ) : null}
                  {item.badge != null && item.badge !== false && item.badge !== 0 ? (
                    <Box
                      component="span"
                      data-geek-nav-rail="badge"
                      sx={{
                        position: 'absolute',
                        top: -2,
                        right: 6,
                        minWidth: 16,
                        height: 16,
                        px: 0.5,
                        borderRadius: 8,
                        fontSize: '0.75rem',
                        lineHeight: '16px',
                        fontWeight: 600,
                        textAlign: 'center',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                      }}
                    >
                      {item.badge}
                    </Box>
                  ) : null}
                </Box>
                <Typography
                  variant="caption"
                  component="span"
                  noWrap
                  data-geek-nav-rail="label"
                  sx={{
                    display: 'block',
                    maxWidth: '100%',
                    fontSize: '0.75rem',
                    lineHeight: 1.2,
                    fontWeight: active ? 600 : 500,
                    ...labelSx,
                  }}
                >
                  {item.label}
                </Typography>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
      {footer ? (
        <Box
          data-geek-nav-rail="footer"
          sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
        >
          {footer}
        </Box>
      ) : null}
    </Box>
  );
});
