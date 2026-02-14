import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthState = useSharedAuthStore(state => state.setState);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('Processing auth callback');

        // Get tokens from URL
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const refreshToken = params.get('refreshToken');
        const app = params.get('app') || 'basegeek';
        const redirectTo = params.get('redirectTo') || '/';
        const state = params.get('state');

        if (!token) {
          console.error('No token found in callback URL');
          setError('Authentication failed: No token received');
          setLoading(false);
          return;
        }

        console.log('Token received in callback');

        // Set auth state directly
        setAuthState({
          token,
          refreshToken,
          isAuthenticated: true,
          currentApp: app,
          lastActivity: Date.now()
        });

        // Fetch user data if needed
        try {
          console.log('Validating token with API');
          const response = await fetch('/api/auth/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token, app }),
          });

          if (!response.ok) {
            throw new Error(`Token validation failed: ${response.status}`);
          }

          const data = await response.json();
          if (data.valid && data.user) {
            console.log('Token validated, user data received');
            setAuthState({ user: data.user });
          } else {
            throw new Error('Invalid user data received');
          }
        } catch (error) {
          console.error('Error validating token:', error);
          setError(`Token validation failed: ${error.message}`);
          setLoading(false);
          return;
        }

        // Redirect to the requested page or home
        console.log('Authentication successful, redirecting to:', redirectTo);
        navigate(redirectTo);
      } catch (error) {
        console.error('Error handling auth callback:', error);
        setError(error.message || 'Authentication failed');
        setLoading(false);
        // After a delay, redirect to login
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [navigate, location, setAuthState]);

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
        p={2}
      >
        <Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
          <Typography variant="body1">{error}</Typography>
          <Typography variant="body2" mt={1}>
            Redirecting to login...
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
    >
      <CircularProgress />
      <Typography variant="body1" sx={{ mt: 2 }}>
        Completing authentication...
      </Typography>
    </Box>
  );
}