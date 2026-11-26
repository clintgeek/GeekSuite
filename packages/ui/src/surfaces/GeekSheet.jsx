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
 *
 * `initialFocus` (MOBILE_UI_PLAN.md §4b): a child's own `autoFocus` loses the
 * race in sheet mode — the paper takes focus (see above) after the drawer has
 * finished sliding in, which lands after the child already tried. Rather than
 * a caller-derived timeout (todogeek's 260ms guess), this primitive focuses
 * the target itself once the *open transition actually ends*: sheet mode
 * hangs the check off `SwipeableDrawer`'s `SlideProps.onEntered`, dialog mode
 * off `Dialog`'s `TransitionProps.onEntered` — both fire once, after the
 * paper is in place, in either mode. `initialFocus={true}` focuses the first
 * focusable element inside the body (`data-geek-sheet="body"`); a string
 * focuses `body.querySelector(initialFocus)`. Omit it and nothing changes.
 *
 * `data-geek-sheet="close"` in sheet mode (MOBILE_UI_PLAN.md §4b "Follow-ups
 * surfaced by M3–M5"): a `snap="full"` panel has no visible way to dismiss it
 * short of the handle, the backdrop or Escape — thin for something opened
 * from an icon. It reuses the hook the dialog-mode close button already
 * carries, so a caller selecting on `data-geek-sheet="close"` finds the same
 * control in both modes. `snap="content"` sheets keep relying on the handle/
 * backdrop/Escape, same as before — the panel is short enough that a close
 * button would crowd the header over a title that's already one swipe away
 * from gone.
 *
 * `actionsAlign` (MOBILE_UI_PLAN.md §4b "Follow-ups surfaced by M3–M5"): the
 * actions band had no alignment control. `'stretch'` fills the row with a
 * single full-width action (the common one-button "Apply" case); `'end'`
 * (MUI's own `DialogActions` default) right-aligns a Cancel/Confirm pair;
 * `'start'` left-aligns. Default is `'stretch'` for exactly one action child,
 * `'end'` otherwise — a caller with a strong opinion can always override it.
 *
 * Tablet width (tablet baseline "Fix first" 3, 2026-11-16): sheet mode runs
 * up to the `md` breakpoint, so a portrait tablet (800 px) used to get a
 * bottom sheet as wide as the screen, with 780 px lines. From
 * `geekMedia.tabletUp` (600 px wide and not a phone held sideways) the sheet
 * paper is capped at `tabletMaxWidth` (default 600, the dialog's `sm`) and
 * centred: still anchored to the bottom, still the same Drawer, handle,
 * backdrop, Escape, Back (`backToClose`) and close button — only its width
 * and edges change. A `snap="full"` sheet there stops 16 px short of the top
 * so its rounded top edge and the backdrop show it is a sheet. CSS only: a
 * phone below 600 px gets the very same markup and no matching rule, so it is
 * unchanged. Desktop is untouched: `mode="auto"` is already a centred Dialog
 * from `md` (900 px) up. `tabletMaxWidth={false}` keeps the full-width sheet.
 *
 * Crossing `md` while open (a tablet rotating, 2026-11-25): sheet and dialog
 * are two different MUI element trees (`SwipeableDrawer` vs `Dialog`), so
 * rendering `children` inside either used to unmount and remount them — a
 * half-typed form lost its draft, focus and scroll. `children` are therefore
 * rendered ONCE, by `createPortal`, into a detached `<div style="display:
 * contents">` host that this component owns, from a fixed position in its
 * own output (a sibling of the Drawer/Dialog, so a mode change cannot touch
 * it). The body element of whichever surface is current adopts the host
 * through a ref callback (`appendChild` moves the live DOM; nothing is
 * re-created). Consequences, all handled below:
 *  - a DOM move blurs and resets scroll, so focus, text selection and the
 *    body's scrollTop are snapshotted during the render that flips the mode
 *    and put back afterwards;
 *  - React events from a portal bubble to the portal's React parent, not
 *    through the Paper/Modal, so Escape is handled on a wrapper inside the
 *    portal (`handleContentKeyDown`), which also honours `defaultPrevented`;
 *  - `children` must not exist while the sheet is closed, so they mount only
 *    once a body exists (`bodyNode`) and unmount when the exit transition
 *    ends (unless `keepMounted`);
 *  - `initialFocus` fires once per open, not again on a mode flip.
 * Without a `document` (SSR/node tests) children render inline, as before.
 * DOM shape: `[data-geek-sheet="body"] > div(host) > div(wrapper) > children`.
 */
import {
  Children,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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
import { useReducedMotion } from '../motion.js';
import { useBackToClose } from '../hooks/useBackToClose.js';
import { geekMedia } from '../hooks/useFormFactor.js';

/** Widest a sheet gets on a tablet (matches the dialog's `maxWidth="sm"`). */
export const GEEK_SHEET_TABLET_MAX_WIDTH = 600;
/** Gap above a `snap="full"` sheet on a tablet, so it reads as a sheet. */
const TABLET_FULL_SNAP_GAP = 16;

/** Selector for "the first focusable element", used when `initialFocus` is
 * `true` rather than a caller-supplied selector string. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

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
  actionsAlign,
  snap = 'content',
  mode = 'auto',
  maxWidth = 'sm',
  // Sheet mode at tablet width: cap and centre the paper (see file header).
  tabletMaxWidth = GEEK_SHEET_TABLET_MAX_WIDTH,
  initialFocus,
  dialogProps,
  drawerProps,
  keepMounted = false,
  sx,
  bodySx,
  headerSx,
  // Android Back closes the sheet (review 3.27, hooks/backStack.js). Pass
  // false only when the caller already owns a history entry for it.
  backToClose = true,
}) {
  useBackToClose(open, onClose, { enabled: backToClose });
  const theme = useTheme();
  const isBelowNavBreakpoint = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const paperRef = useRef(null);
  const bodyRef = useRef(null);
  // The stable host `children` are portalled into (null without a document).
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.style.display = 'contents';
    return el;
  });
  // The body element of the current surface; children mount only once it exists.
  const [bodyNode, setBodyNode] = useState(null);
  const snapshotRef = useRef(null);
  const lastModeRef = useRef(null);
  const enteredRef = useRef(false);
  const handlePaperRef = useForkRef(paperRef, drawerProps?.PaperProps?.ref);

  const resolvedMode = mode === 'auto' ? (isBelowNavBreakpoint ? 'sheet' : 'dialog') : mode;
  const isSheet = resolvedMode === 'sheet';

  // The render that flips the mode is the last moment the old DOM (and so
  // focus and scroll) is still in the document — see the file header.
  if (host && lastModeRef.current && lastModeRef.current !== resolvedMode) {
    const active = host.ownerDocument.activeElement;
    snapshotRef.current = {
      scrollTop: bodyRef.current ? bodyRef.current.scrollTop : 0,
      focused: host.isConnected && active && host.contains(active) ? active : null,
      start: null,
      end: null,
    };
    const f = snapshotRef.current.focused;
    if (f) {
      try {
        snapshotRef.current.start = f.selectionStart;
        snapshotRef.current.end = f.selectionEnd;
      } catch {
        /* inputs without a selection (checkbox, number...) */
      }
    }
  }
  lastModeRef.current = resolvedMode;

  // Adopt the host into whichever body is current. Stable identity: React
  // calls it with null for the old surface and the node for the new one.
  const handleBodyRef = useCallback(
    (node) => {
      bodyRef.current = node;
      if (!node || !host) return;
      node.appendChild(host);
      setBodyNode(node);
    },
    [host]
  );

  // After a flip: restore scroll before paint, then focus once the new
  // surface's own focus trap has had its turn (passive effects run after).
  useLayoutEffect(() => {
    const snap = snapshotRef.current;
    if (!snap || !bodyNode || !bodyNode.isConnected) return;
    bodyNode.scrollTop = snap.scrollTop;
  }, [bodyNode]);
  useEffect(() => {
    const snap = snapshotRef.current;
    if (!snap || !bodyNode || !bodyNode.isConnected) return;
    snapshotRef.current = null;
    const el = snap.focused;
    if (!el || !el.isConnected) return;
    el.focus({ preventScroll: true });
    if (snap.start !== null && snap.end !== null) {
      try {
        el.setSelectionRange(snap.start, snap.end);
      } catch {
        /* not a text field */
      }
    }
  }, [bodyNode]);

  // Closed and fully exited (or never opened on this surface): drop children.
  const releaseBody = () => {
    if (!keepMounted) setBodyNode(null);
  };
  useEffect(() => {
    if (!open) enteredRef.current = false;
    // Flipped while closing: the new surface renders nothing, so no exit
    // transition will ever report back.
    if (!open && !keepMounted) setBodyNode(null);
  }, [open, keepMounted, resolvedMode]);
  // Reopened on a surface MUI kept in the DOM (SwipeableDrawer keeps its
  // modal mounted after the first open): the body node never left, so its ref
  // callback does not fire again. Adopt it here, or the sheet reopens empty.
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!open || !host || !node) return;
    if (host.parentNode !== node) node.appendChild(host);
    setBodyNode((current) => (current === node ? current : node));
  }, [open, host, resolvedMode]);

  const actionCount = actions ? Children.count(actions) : 0;
  const resolvedActionsAlign = actionsAlign ?? (actionCount === 1 ? 'stretch' : 'end');
  const actionsJustify =
    resolvedActionsAlign === 'start'
      ? 'flex-start'
      : resolvedActionsAlign === 'stretch'
        ? 'stretch'
        : 'flex-end';

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

  // Escape from inside `children` (portalled, so it never reaches the Paper
  // or MUI's modal root by React bubbling). Same contract as MUI's own.
  const handleContentKeyDown = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const surface = isSheet ? drawerProps : dialogProps;
    if (surface?.disableEscapeKeyDown) return;
    event.stopPropagation();
    onClose?.(event, 'escapeKeyDown');
  };
  const content = host
    ? createPortal(
        <div style={{ display: 'contents' }} onKeyDown={handleContentKeyDown}>
          {bodyNode ? children : null}
        </div>,
        host
      )
    : null;

  // Fires once the open transition actually finishes, in either mode — see
  // the `initialFocus` note in the file header. A no-op with no target.
  const focusInitial = () => {
    if (enteredRef.current) return; // a mode flip re-runs the transition
    enteredRef.current = true;
    if (!initialFocus) return;
    const container = bodyRef.current;
    if (!container) return;
    const target =
      initialFocus === true
        ? container.querySelector(FOCUSABLE_SELECTOR)
        : container.querySelector(initialFocus);
    target?.focus();
  };

  // MUI's Modal cannot portal into a document that does not exist (node/SSR
  // tests); rendering inline there is otherwise harmless since these apps are
  // client-only SPAs. See the file header.
  const disablePortal = typeof document === 'undefined';
  const transitionDuration = prefersReducedMotion ? 0 : geekMotion.duration.route;

  if (isSheet) {
    const fullSnap = snap === 'full';
    return (
      <>
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
        SlideProps={{
          ...drawerProps?.SlideProps,
          onEntered: (node, isAppearing) => {
            drawerProps?.SlideProps?.onEntered?.(node, isAppearing);
            focusInitial();
          },
          onExited: (node) => {
            drawerProps?.SlideProps?.onExited?.(node);
            releaseBody();
          },
        }}
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
            ...(tabletMaxWidth
              ? {
                  [geekMedia.tabletUp]: {
                    width: '100%',
                    maxWidth: tabletMaxWidth,
                    mx: 'auto',
                    borderRadius: '16px 16px 0 0',
                    borderLeft: (t) => `1px solid ${t.palette.divider}`,
                    borderRight: (t) => `1px solid ${t.palette.divider}`,
                    ...(fullSnap
                      ? {
                          height: `calc(100vh - ${TABLET_FULL_SNAP_GAP}px)`,
                          '@supports (height: 100dvh)': {
                            height: `calc(100dvh - ${TABLET_FULL_SNAP_GAP}px)`,
                          },
                        }
                      : null),
                  },
                }
              : null),
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
        <Box
          data-geek-sheet="header"
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            flexShrink: 0,
            px: 2,
            pt: 1.5,
            pb: 1,
            ...(fullSnap ? { pr: 6 } : null),
            ...headerSx,
          }}
        >
          <Box id={titleId} sx={{ minWidth: 0, flex: 1 }}>
            <SheetTitleContent title={title} description={description} />
          </Box>
          {fullSnap ? (
            <IconButton
              data-geek-sheet="close"
              onClick={onClose}
              aria-label="Close"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                // Above the body: a sheet with a collapsed header (BookGeek's
                // book, headerSx p:0) draws its body under this button, and
                // the body took every tap meant for it (2026-11-15).
                zIndex: 2,
                minWidth: geekLayout.minClickTarget,
                minHeight: geekLayout.minClickTarget,
                borderRadius: `${geekShape.radius.control}px`,
              }}
            >
              <CloseGlyph />
            </IconButton>
          ) : null}
        </Box>
        <Box
          data-geek-sheet="body"
          ref={handleBodyRef}
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
          {host ? null : children}
        </Box>
        {actions ? (
          <Box
            data-geek-sheet="actions"
            sx={{
              flexShrink: 0,
              display: 'flex',
              gap: 1,
              justifyContent: actionsJustify,
              px: 2,
              pt: 1.5,
              pb: 'calc(16px + env(safe-area-inset-bottom))',
              borderTop: (t) => `1px solid ${t.palette.divider}`,
              ...(resolvedActionsAlign === 'stretch' ? { '& > *': { flex: 1 } } : null),
            }}
          >
            {actions}
          </Box>
        ) : null}
      </SwipeableDrawer>
      {host ? content : null}
      </>
    );
  }

  return (
    <>
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
      TransitionProps={{
        ...dialogProps?.TransitionProps,
        onEntered: (node, isAppearing) => {
          dialogProps?.TransitionProps?.onEntered?.(node, isAppearing);
          focusInitial();
        },
        onExited: (node) => {
          dialogProps?.TransitionProps?.onExited?.(node);
          releaseBody();
        },
      }}
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
        ref={handleBodyRef}
        sx={{ minHeight: 0, overflowY: 'auto', ...bodySx }}
      >
        {host ? null : children}
      </DialogContent>
      {actions ? (
        <DialogActions
          data-geek-sheet="actions"
          sx={{
            justifyContent: actionsJustify,
            ...(resolvedActionsAlign === 'stretch' ? { '& > *': { flex: 1 } } : null),
          }}
        >
          {actions}
        </DialogActions>
      ) : null}
    </Dialog>
    {host ? content : null}
    </>
  );
}
