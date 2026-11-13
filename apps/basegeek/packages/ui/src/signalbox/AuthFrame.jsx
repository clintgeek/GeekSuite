/**
 * AuthFrame — the sign-in path's share of the Signal Box.
 *
 * LoginPage and RegisterPage are the suite's SSO door: every app's
 * `loginRedirect()` sends people here, Heather included. So they get the
 * identity at its calmest — the steel panel, the signal-head mark showing
 * clear, the stencil wordmark, a brass rule over the card — and none of the
 * theatre: no flaps, no gauges, nothing that moves, nothing to learn. The
 * form is a form.
 *
 * Behind it, a still wallpaper from the backdrop service (Chef, 2026-11-13;
 * DOCS/BACKDROP_SERVICE_PLAN.md) — the same batch StartGeek shows. It sits
 * under a scrim of the theme's own ground colour, so the wordmark and footer
 * (which are on the backdrop, not the card) keep their contrast in both
 * modes, and the photo reads as texture. No photo → the plain ground, as
 * before.
 */
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { loadBackdrop } from '@geeksuite/backdrop';
import SignalHead from './SignalHead';

function useBackdropUrl() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadBackdrop({ base: window.location.origin }).then((picked) => {
      if (!cancelled && picked) setUrl(picked.url);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return url;
}

export default function AuthFrame({ subtitle, children, footer = 'GeekSuite — one sign-in for every app' }) {
  const backdrop = useBackdropUrl();
  return (
    <Box
      component="main"
      sx={(theme) => ({
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        py: 4,
        bgcolor: theme.palette.surfaces.base,
      })}
    >
      {/* Wallpaper + scrim. Fixed so it fills the screen however long the
          form gets; behind everything (z-index -1 inside the isolated main). */}
      <Box
        aria-hidden
        data-auth-backdrop={backdrop ? 'photo' : 'none'}
        sx={(theme) => ({
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          backgroundImage: backdrop ? `url(${backdrop})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: backdrop ? 1 : 0,
          transition: 'opacity 400ms ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            bgcolor: alpha(theme.palette.surfaces.base, 0.78),
          },
        })}
      />
      <Box sx={{ width: '100%', maxWidth: 400, mx: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
          <SignalHead size={44} />
          <Box>
            <Typography
              component="h1"
              sx={{ fontFamily: 'fontFamilyPlate', fontWeight: 800, fontSize: '2rem', lineHeight: 1, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.primary' }}
            >
              baseGeek
            </Typography>
            <Typography sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.5 }}>
              {subtitle}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={(theme) => ({
            bgcolor: 'background.paper',
            borderRadius: 1.5,
            border: `1px solid ${theme.palette.line.panel}`,
            borderTop: `4px solid ${theme.palette.primary.main}`,
            boxShadow: theme.shadows[3],
            p: { xs: 2.5, sm: 3.5 },
          })}
        >
          {children}
        </Box>

        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'fontFamilyMono' }}>
          {footer}
        </Typography>
      </Box>
    </Box>
  );
}
