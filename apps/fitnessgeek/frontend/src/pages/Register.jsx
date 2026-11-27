import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { loginRedirect } from '@geeksuite/auth';
import { AuthPage } from './Login.jsx';

/**
 * /register — accounts are made on the GeekSuite account page, so this
 * screen only hands the person over. It says so in plain words, in the same
 * card as Sign in, and it cannot strand anyone: if the sign-up page hasn't
 * opened after a few seconds (or the hand-over threw), it says so and offers
 * to try again or go back to Sign in.
 */
const STUCK_AFTER_MS = 6000;

const Register = () => {
  const location = useLocation();
  const [stuck, setStuck] = useState(false);
  const timer = useRef(null);

  const go = useCallback(() => {
    setStuck(false);
    clearTimeout(timer.current);
    try {
      const returnTo = location.state?.from?.pathname
        ? `${window.location.origin}${location.state.from.pathname}`
        : window.location.href;
      loginRedirect('fitnessgeek', returnTo, 'register');
      timer.current = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    } catch {
      setStuck(true);
    }
  }, [location]);

  useEffect(() => {
    go();
    return () => clearTimeout(timer.current);
  }, [go]);

  return (
    <AuthPage data-testid="register-page">
      {stuck ? (
        <Box sx={{ width: '100%', mt: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Alert severity="error" sx={{ textAlign: 'left' }}>
            The sign-up page didn’t open. Check your connection and try again.
          </Alert>
          <Button variant="contained" size="large" fullWidth onClick={go} sx={{ minHeight: 52 }}>
            Try again
          </Button>
          <Button component={RouterLink} to="/login" variant="tonal" size="large" fullWidth sx={{ minHeight: 52 }}>
            Back to sign in
          </Button>
        </Box>
      ) : (
        <Box role="status" sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CircularProgress size={32} aria-hidden />
          <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
            Taking you to sign-up…
          </Typography>
        </Box>
      )}
    </AuthPage>
  );
};

export default Register;
