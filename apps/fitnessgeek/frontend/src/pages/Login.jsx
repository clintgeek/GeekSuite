import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import { getBackendOrigin, loginRedirect } from '../utils/authClient.js';

const Login = () => {
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const localLoginEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_LOGIN !== 'false';

  const redirectTarget = (() => {
    if (location.state?.from?.pathname) {
      return `${window.location.origin}${location.state.from.pathname}`;
    }
    return window.location.origin + '/';
  })();

  useEffect(() => {
    if (localLoginEnabled) {
      return;
    }

    loginRedirect(redirectTarget, 'login');
  }, [location, localLoginEnabled, redirectTarget]);

  const handleLocalLogin = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`${getBackendOrigin()}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier,
          password,
          app: 'fitnessgeek'
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || 'Local login failed');
      }

      window.location.href = redirectTarget;
    } catch (err) {
      setError(err.message || 'Unable to login locally');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2
      }}
    >
      {localLoginEnabled ? (
        <Box
          component="form"
          onSubmit={handleLocalLogin}
          sx={{
            width: '100%',
            maxWidth: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          <Typography variant="h5" textAlign="center">
            Local Developer Login
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Credentials are sent through the FitnessGeek backend so cookies can be rewritten for
            localhost. This form only appears in development builds.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Email or username"
              type="text"
              value={identifier}
              autoComplete="username"
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={submitting}
              required
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || !identifier || !password}
            >
              {submitting ? 'Signing in…' : 'Sign in locally'}
            </Button>
          </Stack>
        </Box>
      ) : (
        <>
          <CircularProgress size={40} />
          <Typography>Redirecting to baseGeek…</Typography>
        </>
      )}
    </Box>
  );
};

export default Login;