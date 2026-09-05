/**
 * GeekSheet — one primitive for "the picker/filter/sort/more surface".
 *
 * The rule (DOCS/MOBILE_UI_PLAN.md §2): pickers, filters, sort and "more" menus
 * open as a bottom sheet below `md` and as a centered Dialog at `md`+. Callers
 * never branch on breakpoint themselves — they render one `<GeekSheet>` and
 * this primitive decides the surface.
 *
 * `mode="auto"` (the default) detects the breakpoint itself with
 * `useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint))` — the same
 * query `GeekShell` uses, but read independently, because sheets are routinely
 * rendered outside a `GeekShell` (a picker opened from a route with no shell
 * chrome around it). `mode="sheet"` / `mode="dialog"` force a side for tests
 * and for callers that already know which surface they want.
 *
 * SSR note: sheet mode is built on MUI's `SwipeableDrawer`, which itself
 * renders a plain `Drawer` plus (only when swipe-to-open is enabled) a
 * `NoSsr`-wrapped edge-swipe hit area. This primitive always passes
 * `disableSwipeToOpen`, so that second part never mounts, and the touch
 * listeners `SwipeableDrawer` adds are attached in a `useEffect` — never
 * during render. That makes it exactly as SSR-safe as the plain `Drawer`
 * `GeekShell` already renders under `react-dom/server`, so no Drawer fallback
 * is needed. The remaining SSR hazard is shared with `GeekTopBar`'s account
 * `Menu`: MUI's `Modal` portals into `document.body` by default, which does
 * not exist under a `node` test environment, so both the sheet and the
 * dialog pass `disablePortal` when `document` is undefined (these apps are
 * client-only SPAs, never hydrated, so skipping the portal only in that
 * environment carries no runtime risk) and forward this primitive's own
 * `keepMounted` prop straight through to MUI's `Modal` so tests can render
 * closed markup when they need to.
 *
 * Escape (MOBILE_UI_PLAN.md §4b): MUI closes a modal on Escape from a
 * `keydown` handler on the *modal root*, so the key event has to bubble out of
 * something inside the drawer. `FocusTrap` normally moves focus to the paper
 * when the drawer opens, but not always — a sheet opened from a control that
 * keeps focus, or a caller-supplied `PaperProps`, and the keypress happens on
 * an element outside the modal, where nothing hears it. Two belts here, both
 * on the paper (`data-geek-sheet="paper"`): an explicit `tabIndex={-1}` plus a
 * post-open focus check that pulls focus in when it is still outside, and an
 * own `keydown` handler so Escape closes the sheet even when the event never
 * reaches MUI's root handler. The handler stops propagation so MUI's handler
 * does not fire `onClose` a second time.
 */
import { useEffect, useId, useRef } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import useForkRef from '@mui/material/utils/useForkRef';
import useMediaQuery from '@mui/material/useMediaQuery';
import { geekLayout, geekMotion, geekShape } from '../designTokens.js';

/** Inline SVG — @mui/icons-material is not a dependency of this package. */
function CloseGlyph() {
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
      <path d="M6 6l12 12M18 6L6 18" />
    </Box>
  );
}

/**
 * Title + description content. The string-title case is the only one that
 * carries the `data-geek-sheet="title"` hook — a node title renders as-is.
 * The id `aria-labelledby` points at lives on whichever element wraps this
 * per mode (a plain `Box` for the sheet header, `DialogTitle` itself for the
 * dialog), never here, so a node title never ends up with two ids fighting
 * over the same `aria-labelledby`.
 */
function SheetTitleContent({ title, description }) {
  return (
    <>
      {typeof title === 'string' || typeof title === 'number' ? (
        <Typography variant="h3" component="p" data-geek-sheet="title">
          {title}
        </Typography>
      ) : (
        title ?? null
      )}
      {description ? (
        <Typography
          variant="caption"
          data-geek-sheet="description"
          sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}
        >
          {description}
        </Typography>
      ) : null}
    </>
  );
}

export function GeekSheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  snap = 'content',
  mode = 'auto',
  maxWidth = 'sm',
  dialogProps,
  drawerProps,
  keepMounted = false,
  sx,
  bodySx,
  headerSx,
}) {
  const theme = useTheme();
  const isBelowNavBreakpoint = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const titleId = useId();
  const paperRef = useRef(null);
  const handlePaperRef = useForkRef(paperRef, drawerProps?.PaperProps?.ref);

  const resolvedMode = mode === 'auto' ? (isBelowNavBreakpoint ? 'sheet' : 'dialog') : mode;
  const isSheet = resolvedMode === 'sheet';

  // Runs after `SwipeableDrawer`'s own effects (child effects commit first),
  // so by now MUI's focus trap has had its go. If focus is still outside the
  // paper, Escape and the arrow keys would land on whatever the sheet was
  // opened from; pull focus in. See the file header.
  useEffect(() => {
    if (!isSheet || !open) return;
    const paper = paperRef.current;
    if (!paper) return;
    const doc = paper.ownerDocument;
    if (!doc || paper.contains(doc.activeElement)) return;
    paper.focus({ preventScroll: true });
  }, [isSheet, open]);

  const handlePaperKeyDown = (event) => {
    drawerProps?.PaperProps?.onKeyDown?.(event);
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.stopPropagation();
    onClose?.(event, 'escapeKeyDown');
  };

  // MUI's Modal cannot portal into a document that does not exist (node/SSR
  // tests); rendering inline there is otherwise harmless since these apps are
  // client-only SPAs. See the file header.
  const disablePortal = typeof document === 'undefined';
  const transitionDuration = prefersReducedMotion ? 0 : geekMotion.duration.route;

  if (isSheet) {
    const fullSnap = snap === 'full';
    return (
      <SwipeableDrawer
        {...drawerProps}
        anchor="bottom"
        variant="temporary"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        disablePortal={disablePortal}
        keepMounted={keepMounted}
        transitionDuration={transitionDuration}
        role="dialog"
        aria-labelledby={titleId}
        data-geek-sheet="root"
        data-geek-sheet-mode="sheet"
        PaperProps={{
          ...drawerProps?.PaperProps,
          ref: handlePaperRef,
          tabIndex: -1,
          onKeyDown: handlePaperKeyDown,
          'data-geek-sheet': 'paper',
          sx: {
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            borderRadius: fullSnap ? 0 : '16px 16px 0 0',
            backgroundImage: 'none',
            borderTop: (t) => `1px solid ${t.palette.divider}`,
            maxHeight: fullSnap ? undefined : '92vh',
            '@supports (max-height: 92dvh)': fullSnap ? undefined : { maxHeight: '92dvh' },
            height: fullSnap ? '100vh' : undefined,
            '@supports (height: 100dvh)': fullSnap ? { height: '100dvh' } : undefined,
            ...drawerProps?.PaperProps?.sx,
            ...sx,
          },
        }}
      >
        <Box
          aria-hidden="true"
          data-geek-sheet="handle"
          sx={{
            flexShrink: 0,
            width: 36,
            height: 4,
            borderRadius: 2,
            bgcolor: (t) => alpha(t.palette.text.secondary, 0.4),
            alignSelf: 'center',
            mt: 1,
          }}
        />
        <Box data-geek-sheet="header" sx={{ flexShrink: 0, px: 2, pt: 1.5, pb: 1, ...headerSx }}>
          <Box id={titleId} sx={{ minWidth: 0 }}>
            <SheetTitleContent title={title} description={description} />
          </Box>
        </Box>
        <Box
          data-geek-sheet="body"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            px: 2,
            // Without an actions band the body is the bottom edge, so it
            // carries the safe-area inset instead.
            pb: actions ? 0 : 'calc(16px + env(safe-area-inset-bottom))',
            ...bodySx,
          }}
        >
          {children}
        </Box>
        {actions ? (
          <Box
            data-geek-sheet="actions"
            sx={{
              flexShrink: 0,
              px: 2,
              pt: 1.5,
              pb: 'calc(16px + env(safe-area-inset-bottom))',
              borderTop: (t) => `1px solid ${t.palette.divider}`,
            }}
          >
            {actions}
          </Box>
        ) : null}
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      {...dialogProps}
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={maxWidth}
      keepMounted={keepMounted}
      disablePortal={disablePortal}
      transitionDuration={transitionDuration}
      aria-labelledby={titleId}
      data-geek-sheet="root"
      data-geek-sheet-mode="dialog"
      PaperProps={{
        ...dialogProps?.PaperProps,
        sx: {
          borderRadius: `${geekShape.radius.panel}px`,
          backgroundImage: 'none',
          ...dialogProps?.PaperProps?.sx,
          ...sx,
        },
      }}
    >
      <DialogTitle
        id={titleId}
        data-geek-sheet="header"
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          pr: 6,
          ...headerSx,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <SheetTitleContent title={title} description={description} />
        </Box>
        <IconButton
          data-geek-sheet="close"
          onClick={onClose}
          aria-label="Close"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            minWidth: geekLayout.minClickTarget,
            minHeight: geekLayout.minClickTarget,
            borderRadius: `${geekShape.radius.control}px`,
          }}
        >
          <CloseGlyph />
        </IconButton>
      </DialogTitle>
      <DialogContent
        data-geek-sheet="body"
        sx={{ minHeight: 0, overflowY: 'auto', ...bodySx }}
      >
        {children}
      </DialogContent>
      {actions ? (
        <DialogActions data-geek-sheet="actions">{actions}</DialogActions>
      ) : null}
    </Dialog>
  );
}
