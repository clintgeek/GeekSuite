/**
 * GeekUpdateIndicator — "Updating…" while a new build downloads.
 *
 * Why it exists (2026-10-04). Under DOCS/PWA_STANDARD.md the first open
 * after a deploy is always a double draw: page loads are cache-first (row
 * 5), so the OLD build renders; the new worker then downloads the new build
 * in the background and, because it takes over immediately (rule 6:
 * skipWaiting + clients.claim), the app reloads into it. Measured on
 * GameGeek: old build at 0.1 s, reload ~5 s later. Chef kept both rules, so
 * the reload stays; this says what is happening instead of letting it look
 * like the app is glitching.
 *
 * It shows only for an UPDATE — a page that already had a controlling worker
 * when the new one started installing. A first-ever install is silent (no
 * reload follows it either). It hides again if the install fails, so a
 * broken deploy never leaves a stuck banner. It does not reload anything
 * itself: each app's registration (controllerchange / workbox `activated`)
 * still does that, once.
 *
 * Render it once near the root of the app, inside the MUI ThemeProvider.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

/**
 * True while a new service worker is installing over an existing one.
 * `sw` is injectable for tests; it defaults to `navigator.serviceWorker`.
 */
export function useServiceWorkerUpdating(sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined) {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!sw || typeof sw.getRegistration !== 'function') return undefined;
    // Read now, not when the update lands: by then `controller` may already
    // be the new worker.
    const hadController = Boolean(sw.controller);
    if (!hadController) return undefined;

    let cancelled = false;
    let registration = null;

    const track = (worker) => {
      if (!worker || cancelled) return;
      setUpdating(true);
      worker.addEventListener('statechange', () => {
        // 'redundant' = the install failed or was superseded; the reload is
        // not coming, so the banner goes.
        if (worker.state === 'redundant' && !cancelled) setUpdating(false);
      });
    };
    const onUpdateFound = () => track(registration?.installing);
    // The takeover itself. A fast install (BookGeek's hand-rolled sw.js on a
    // quick connection: update found at ~40 ms, takeover at ~160 ms) can be
    // over before React mounts, but the reload it triggers lands ~1 s later
    // (it waits for activation) — so a takeover is "updating" too.
    const onControllerChange = () => !cancelled && setUpdating(true);
    sw.addEventListener?.('controllerchange', onControllerChange);

    sw.getRegistration().then((reg) => {
      if (!reg || cancelled) return;
      registration = reg;
      // The update may have started before React mounted.
      if (reg.installing) track(reg.installing);
      else if (reg.waiting || reg.active?.state === 'activating') setUpdating(true);
      reg.addEventListener('updatefound', onUpdateFound);
    }).catch(() => {});

    return () => {
      cancelled = true;
      registration?.removeEventListener('updatefound', onUpdateFound);
      sw.removeEventListener?.('controllerchange', onControllerChange);
    };
  }, [sw]);

  return updating;
}

export function GeekUpdateIndicator({ serviceWorker, label = 'Updating to the latest version…' }) {
  const updating = useServiceWorkerUpdating(serviceWorker);
  if (!updating) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      data-testid="geek-update-indicator"
      sx={(theme) => ({
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.snackbar + 1,
        pointerEvents: 'none',
      })}
    >
      <LinearProgress aria-hidden="true" sx={{ height: 3 }} />
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 'calc(8px + env(safe-area-inset-top, 0px))' }}>
        <Typography
          component="span"
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: '999px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: 1,
            borderColor: 'divider',
            boxShadow: 2,
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
