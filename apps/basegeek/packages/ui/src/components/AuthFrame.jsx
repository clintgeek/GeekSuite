/**
 * AuthFrame — the GeekSuite sign-in screen.
 *
 * LoginPage and RegisterPage are the suite's SSO door: every app's
 * `loginRedirect()` sends people here, Heather included. Until 2026-11-13 the
 * door wore basegeek's Signal Box identity; Chef asked for it de-themed — a
 * plain "GeekSuite Login" that looks like StartGeek: the same wallpaper from
 * the backdrop service (DOCS/BACKDROP_SERVICE_PLAN.md), the same scrim, the
 * same thin clock and date, and a dark-glass card for the form.
 *
 * The look is deliberately self-contained. It does not follow basegeek's
 * light/dark mode or Signal Box tokens: the tokens in authLook.js are copied from
 * apps/startgeek/src/index.css, and the form's MUI parts get a local theme
 * built from them. If StartGeek's palette moves, move these with it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { loadBackdrop } from '@geeksuite/backdrop';
import '@fontsource/geist/latin-200.css';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import { START, authTheme } from './authLook';

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

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** StartGeek's hero clock, without its 12/24 h setting: the locale decides. */
function Clock() {
  const now = useNow();
  const hour12 = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12, []);
  const h = now.getHours();
  const hours = hour12 ? h % 12 || 12 : String(h).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const rest = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Box sx={{ textAlign: 'center', mb: 8, userSelect: 'none', textShadow: '0 2px 30px rgba(0,0,0,0.35)' }}>
      <Box
        component="time"
        dateTime={now.toISOString()}
        data-auth-clock
        sx={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 3.5,
          fontWeight: 200,
          lineHeight: 0.92,
          letterSpacing: '-0.035em',
          fontVariantNumeric: 'tabular-nums',
          color: START.ink,
          fontSize: { xs: 'clamp(56px, 15vw, 96px)', sm: 'clamp(72px, 11vw, 120px)' },
        }}
      >
        <span>{hours}:{minutes}</span>
        {hour12 && (
          <Box component="span" sx={{ fontFamily: START.mono, fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: START.ink2, transform: 'translateY(-0.5em)' }}>
            {h >= 12 ? 'pm' : 'am'}
          </Box>
        )}
      </Box>
      <Typography sx={{ mt: 1.5, fontSize: 17, color: START.ink2 }}>
        <Box component="span" sx={{ fontWeight: 500, color: START.ink }}>{weekday}</Box>
        <Box component="span" sx={{ mx: 2, color: START.ink3 }}>·</Box>
        {rest}
      </Typography>
    </Box>
  );
}

export default function AuthFrame({ title = 'GeekSuite Login', lede, children, footer = 'One sign-in for every GeekSuite app' }) {
  const backdrop = useBackdropUrl();

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <ThemeProvider theme={authTheme}>
      <Box
        component="main"
        sx={{
          position: 'relative',
          isolation: 'isolate',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          '@supports (height: 100dvh)': { minHeight: '100dvh' },
          px: 4,
          py: 8,
          bgcolor: START.ground,
          color: START.ink,
          fontFamily: START.sans,
          colorScheme: 'dark',
        }}
      >
        {/* StartGeek's BackgroundManager in Photo mode, minus the brightness
            probe: wallpaper (softened, scaled so the blur has no hard edge),
            the top-light/bottom-heavy scrim, and the warm glow at the top. */}
        <Box aria-hidden sx={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', bgcolor: START.ground }}>
          <Box
            data-auth-backdrop={backdrop ? 'photo' : 'none'}
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: backdrop ? `url(${backdrop})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'saturate(0.9) brightness(0.92) blur(2px)',
              transform: 'scale(1.03)',
              opacity: backdrop ? 1 : 0,
              transition: 'opacity 1000ms ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(10,13,18,0.30) 0%, rgba(10,13,18,0.34) 45%, rgba(10,13,18,0.62) 100%)',
            }}
          />
          <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(50% 35% at 50% 0%, rgba(230,179,90,0.07), transparent 70%)' }} />
        </Box>

        <Clock />

        <Box
          sx={{
            width: '100%',
            maxWidth: 400,
            borderRadius: '16px',
            background: 'rgba(16, 20, 27, 0.7)',
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            border: `1px solid ${START.hairStrong}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.45)',
            p: { xs: 5, sm: 7 },
          }}
        >
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', textAlign: 'center', color: START.ink }}>
            {title}
          </Typography>
          {lede && (
            <Typography sx={{ mt: 1, fontSize: 14, textAlign: 'center', color: START.ink2 }}>{lede}</Typography>
          )}
          <Box sx={{ mt: 5 }}>{children}</Box>
        </Box>

        <Typography sx={{ mt: 6, fontFamily: START.mono, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: START.ink2, textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
          {footer}
        </Typography>
      </Box>
    </ThemeProvider>
  );
}
