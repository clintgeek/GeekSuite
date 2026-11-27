import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useAuth } from '@geeksuite/auth';
import { Surface } from '../components/primitives';

/**
 * Sign in — the first thing a person sees, so it looks like the app behind
 * it (Daylight): the soft grey ground, one white card, the ring mark, one
 * blue button. Signing in happens on the GeekSuite account page; this page's
 * whole job is to say what the app is and send the person there.
 *
 * States it has to handle, because a button that silently does nothing is
 * the worst first impression there is:
 *   - the app can't reach its server (`connectionProblem`): said, with a retry
 *   - the sign-in page didn't open (the redirect threw, or nothing happened
 *     for a while): said, and the button comes back
 *   - an error from the session check (`error`): shown in words
 */

const STUCK_AFTER_MS = 8000;

/** The app's mark: the same three-quarter ring as the icon and the sidebar. */
export function RingMark({ size = 56 }) {
  const ring = Math.round(size * 0.64);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.3)}px`,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={ring} height={ring} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30.6 40.8" transform="rotate(-90 9 9)" />
      </svg>
    </Box>
  );
}

/** The page both public screens share: a centred card on the grey ground. */
export function AuthPage({ children, ...rest }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 4,
        py: 8,
        pt: 'calc(32px + env(safe-area-inset-top))',
        pb: 'calc(32px + env(safe-area-inset-bottom))',
      }}
      {...rest}
    >
      <Surface sx={{ width: '100%', maxWidth: 400, p: { xs: 6, sm: 8 }, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <RingMark />
        <Typography component="h1" sx={{ mt: 4, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          FitnessGeek
        </Typography>
        {children}
      </Surface>
    </Box>
  );
}

/**
 * Runs a redirect and reports whether the page is still here afterwards:
 * `busy` while it should be leaving, `stuck` if it threw or never left.
 * Coming back with the browser's Back button clears both.
 */
export function useLeaving() {
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const reset = () => { clearTimeout(timer.current); setBusy(false); };
    window.addEventListener('pageshow', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
      clearTimeout(timer.current);
    };
  }, []);

  const leave = async (go) => {
    if (busy) return;
    setBusy(true);
    setStuck(false);
    clearTimeout(timer.current);
    try {
      await go();
      // Still here after a while: the page never opened.
      timer.current = setTimeout(() => { setBusy(false); setStuck(true); }, STUCK_AFTER_MS);
    } catch {
      setBusy(false);
      setStuck(true);
    }
  };

  return { busy, stuck, leave };
}

const Login = () => {
  const { login, register, loading, error, connectionProblem, retry } = useAuth();
  const signIn = useLeaving();
  const signUp = useLeaving();
  const busy = loading || signIn.busy || signUp.busy;
  const stuck = signIn.stuck || signUp.stuck;
  const errorText = typeof error === 'string' ? error : error?.message;

  return (
    <AuthPage data-testid="login-page">
      <Typography sx={{ mt: 2, color: 'text.secondary', fontSize: '1.0625rem', lineHeight: 1.45 }}>
        Sign in to keep your food, weight and health in one place.
      </Typography>

      <Box sx={{ width: '100%', mt: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {connectionProblem && (
          <Alert
            severity="warning"
            data-testid="login-connection"
            sx={{ textAlign: 'left' }}
            action={retry ? <Button color="inherit" size="small" onClick={() => retry()} sx={{ minHeight: 44 }}>Try again</Button> : undefined}
          >
            Can’t reach FitnessGeek right now. Check your connection.
          </Alert>
        )}
        {!connectionProblem && stuck && (
          <Alert severity="error" data-testid="login-stuck" sx={{ textAlign: 'left' }}>
            The sign-in page didn’t open. Check your connection and try again.
          </Alert>
        )}
        {!connectionProblem && !stuck && errorText && (
          <Alert severity="error" data-testid="login-error" sx={{ textAlign: 'left' }}>
            {errorText}
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={busy}
          onClick={() => signIn.leave(() => login())}
          sx={{ minHeight: 52 }}
        >
          {signIn.busy ? 'Opening sign-in…' : 'Sign in'}
        </Button>
        <Button
          variant="tonal"
          size="large"
          fullWidth
          disabled={busy}
          onClick={() => signUp.leave(() => register())}
          sx={{ minHeight: 52 }}
        >
          {signUp.busy ? 'Opening sign-up…' : 'Create an account'}
        </Button>
      </Box>

    </AuthPage>
  );
};

export default Login;
