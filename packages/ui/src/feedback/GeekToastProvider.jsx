/**
 * GeekToastProvider — one transient-message surface for the whole suite.
 *
 * Rules, and why:
 *
 *   - **MUI `Snackbar` + `Alert variant="standard"`.** The `filled` variant
 *     paints `palette[tone].main` and drops white text on it; the suite's
 *     semantic tones are tuned as *foregrounds* (3:1 as graphics), so filled
 *     lands under AA for warning and info in at least one mode. The standard
 *     variant derives a tinted surface and a same-hue text color from the same
 *     token and clears 4.5:1 in both modes. Standard it is.
 *   - **Placement follows the shell, not the viewport.** Bottom-center on
 *     mobile; bottom-*left* on desktop, offset by the sidebar width when a
 *     permanent nav panel is on screen, so a toast never covers the nav it is
 *     probably telling you about. Read from `useGeekShell()`, so an app that
 *     mounts no shell simply gets the bottom-left default.
 *   - **`bottomInset` is respected**, so a toast never hides under a
 *     `GeekBottomNav`.
 *   - **At most three at once.** A fourth message evicts the oldest rather
 *     than growing a column that eats the screen.
 *   - **One column, never side by side.** The stack is an explicit flex
 *     column. Two toasts used to sit in a row on a phone, the second clipped
 *     off the right edge.
 *   - **Above a sheet's sticky footer.** A sheet's "Done" ribbon or Save bar
 *     registers with `useGeekToastClearance(ref)` and the stack rises above
 *     it, so a ten-second toast never covers the button under the thumb.
 *   - **Inside the open dialog.** A modal marks everything outside itself
 *     `aria-hidden` and traps focus, so a toast rendered at the app root was
 *     invisible to a screen reader and its Undo couldn't be reached by Tab.
 *     While a dialog or drawer is open, the stack is portalled into that
 *     modal's focus-trapped content; it moves back out as soon as the modal
 *     starts to close, so it never fades or slides away with it.
 *     Menus and popovers don't count, they're too brief to host anything.
 *
 * One `Snackbar` holds the stack. MUI's own `autoHideDuration` is per-Snackbar
 * and would expire the whole stack together, so each toast carries its own
 * timer.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Portal from '@mui/material/Portal';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { geekLayout } from '../designTokens.js';
import { useGeekShell } from '../navigation/shellContext.js';
import { GeekToastClearanceContext, GeekToastContext, activeModalHost, openModals, trapRootOf } from './toastContext.js';

export const GEEK_TOAST_MAX = 3;
export const GEEK_TOAST_DURATION = 4000;

const TONES = new Set(['info', 'success', 'warning', 'error']);

let nextId = 0;

// Server render and the first client paint have no DOM to measure.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Follows `activeModalHost()` while `watching`: modals come and go under it. */
function useModalHost(watching) {
  const [host, setHost] = useState(null);
  useIsoLayoutEffect(() => {
    if (!watching || typeof document === 'undefined') {
      setHost(null);
      return undefined;
    }
    if (typeof MutationObserver !== 'function') {
      setHost(activeModalHost(document));
      return undefined;
    }
    // A closing modal says so in its trap root's inline style; watch just
    // those few elements' style, never the whole page's.
    const leaving = new MutationObserver(() => setHost(activeModalHost(document)));
    const update = () => {
      leaving.disconnect();
      openModals(document).forEach((modal) => {
        leaving.observe(trapRootOf(modal), { attributes: true, attributeFilter: ['style'] });
      });
      setHost(activeModalHost(document));
    };
    update();
    // Modals mount and unmount as children of <body>; one stacked on top of
    // another flips the lower one's aria-hidden.
    const added = new MutationObserver(update);
    added.observe(document.body, { childList: true });
    const hidden = new MutationObserver(update);
    hidden.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
    return () => {
      added.disconnect();
      hidden.disconnect();
      leaving.disconnect();
    };
  }, [watching]);
  return host;
}

/**
 * MUI's `Alert` gives you the close button *or* a custom `action`, never both,
 * and its built-in close glyph is internal. When a toast carries an action we
 * render the pair ourselves — inline SVG, since `@mui/icons-material` is not a
 * peer of this package.
 */
function CloseGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block' }}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </Box>
  );
}

export function GeekToastProvider({
  children,
  max = GEEK_TOAST_MAX,
  duration = GEEK_TOAST_DURATION,
  // Escape hatch for a shell-less page that still wants centered toasts.
  anchorOrigin,
  sx,
}) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const { isMobile, hasNav, bottomInset } = useGeekShell();

  // Sticky footers the stack must clear (useGeekToastClearance).
  const clearances = useRef(new Set());
  const [lift, setLift] = useState(0);
  const remeasure = useCallback(() => {
    let most = 0;
    clearances.current.forEach((measure) => {
      most = Math.max(most, Number(measure()) || 0);
    });
    setLift(Math.round(most));
  }, []);
  const register = useCallback(
    (measure) => {
      clearances.current.add(measure);
      remeasure();
      return () => {
        clearances.current.delete(measure);
        remeasure();
      };
    },
    [remeasure]
  );
  const clearance = useMemo(() => ({ register, remeasure }), [register, remeasure]);

  const clearTimer = useCallback((id) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id) => {
      if (id === undefined) {
        timers.current.forEach((handle) => clearTimeout(handle));
        timers.current.clear();
        setToasts([]);
        return;
      }
      clearTimer(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [clearTimer]
  );

  const notify = useCallback(
    (message, { tone = 'info', action, duration: ownDuration } = {}) => {
      if (message === null || message === undefined || message === '') return null;

      const id = ++nextId;
      const severity = TONES.has(tone) ? tone : 'info';
      const life = ownDuration ?? duration;

      setToasts((current) => {
        const next = [...current, { id, message, severity, action }];
        // Oldest out, so the newest message is always visible.
        const evicted = next.slice(0, Math.max(0, next.length - max));
        evicted.forEach((toast) => clearTimer(toast.id));
        return next.slice(-max);
      });

      if (life > 0 && life !== Infinity) {
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            setToasts((current) => current.filter((toast) => toast.id !== id));
          }, life)
        );
      }

      return id;
    },
    [clearTimer, duration, max]
  );

  // Unmounting mid-flight should not leave timers pointed at a dead setState.
  useEffect(
    () => () => {
      timers.current.forEach((handle) => clearTimeout(handle));
      timers.current.clear();
    },
    []
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  const showing = toasts.length > 0;
  const host = useModalHost(showing);
  // A toast arriving is the moment the footer's place matters most.
  useIsoLayoutEffect(() => {
    if (showing) remeasure();
  }, [showing, toasts.length, remeasure]);

  const origin =
    anchorOrigin || { vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' };
  const clearsSidebar = !isMobile && hasNav && origin.horizontal === 'left';
  // A full-screen sheet covers the bottom nav, so inside a modal its height
  // is no longer in the way. The footer clearance already counts everything
  // below the footer's top, so it replaces the default gap rather than adding.
  const navGap = (host ? 0 : bottomInset) + 24;
  const bottom = Math.max(navGap, lift + 8);

  const snackbar = (
    <Snackbar
      open={showing}
      anchorOrigin={origin}
      data-geek-toasts
      sx={{
        // `bottomInset` is the GeekBottomNav's height when one is mounted;
        // the safe-area inset keeps the stack off the iOS home indicator.
        bottom: lift > 0 ? `${bottom}px` : `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
        ...(clearsSidebar
          ? { left: `${geekLayout.sidebarWidth + 24}px` }
          : null),
        ...sx,
      }}
    >
      <Box
        data-geek-toast-stack
        sx={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: 480, minWidth: 0 }}
      >
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            severity={toast.severity}
            variant="standard"
            data-geek-toast={toast.severity}
            onClose={toast.action ? undefined : () => dismiss(toast.id)}
            action={
              toast.action ? (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {toast.action}
                  <IconButton
                    size="small"
                    color="inherit"
                    aria-label="Dismiss"
                    onClick={() => dismiss(toast.id)}
                  >
                    <CloseGlyph />
                  </IconButton>
                </Stack>
              ) : undefined
            }
            sx={{ alignItems: 'center', boxShadow: 3 }}
          >
            {toast.message}
          </Alert>
        ))}
      </Box>
    </Snackbar>
  );

  return (
    <GeekToastContext.Provider value={value}>
      <GeekToastClearanceContext.Provider value={clearance}>
        {children}
        {host ? <Portal container={host}>{snackbar}</Portal> : snackbar}
      </GeekToastClearanceContext.Provider>
    </GeekToastContext.Provider>
  );
}
