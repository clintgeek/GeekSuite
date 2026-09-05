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
 *
 * One `Snackbar` holds the stack. MUI's own `autoHideDuration` is per-Snackbar
 * and would expire the whole stack together, so each toast carries its own
 * timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { geekLayout } from '../designTokens.js';
import { useGeekShell } from '../navigation/shellContext.js';
import { GeekToastContext } from './toastContext.js';

export const GEEK_TOAST_MAX = 3;
export const GEEK_TOAST_DURATION = 4000;

const TONES = new Set(['info', 'success', 'warning', 'error']);

let nextId = 0;

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

  const origin =
    anchorOrigin || { vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' };
  const clearsSidebar = !isMobile && hasNav && origin.horizontal === 'left';

  return (
    <GeekToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={toasts.length > 0}
        anchorOrigin={origin}
        data-geek-toasts
        sx={{
          // `bottomInset` is the GeekBottomNav's height when one is mounted;
          // the safe-area inset keeps the stack off the iOS home indicator.
          bottom: `calc(${bottomInset + 24}px + env(safe-area-inset-bottom, 0px))`,
          ...(clearsSidebar
            ? { left: `${geekLayout.sidebarWidth + 24}px` }
            : null),
          ...sx,
        }}
      >
        <Stack spacing={1} sx={{ width: '100%', maxWidth: 480 }}>
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
        </Stack>
      </Snackbar>
    </GeekToastContext.Provider>
  );
}
