import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '@geeksuite/auth';

export const CANT_REACH = "Can't reach FitnessGeek — retrying";

/**
 * A small, non-blocking line while the session check can't reach the
 * server (offline, a 502 mid-restart). She stays signed in through it
 * (review B2); the auth package retries on its own.
 */
function ConnectionLine({ onRetry }) {
  return (
    <Box
      role="status"
      data-testid="connection-problem"
      sx={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        maxWidth: 'calc(100vw - 32px)',
        px: 2,
        py: 0.75,
        borderRadius: 999,
        bgcolor: 'background.paper',
        color: 'text.primary',
        border: 1,
        borderColor: 'divider',
        boxShadow: 2,
      }}
    >
      <CircularProgress size={14} thickness={5} aria-hidden />
      <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
        {CANT_REACH}
      </Typography>
      {onRetry && (
        <Button size="small" onClick={onRetry} sx={{ minHeight: 32, fontWeight: 800, textTransform: 'none' }}>
          Try now
        </Button>
      )}
    </Box>
  );
}

const ProtectedRoute = ({ children }) => {
  const { loading, isAuthenticated, connectionProblem, retry } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default'
        }}
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  // Couldn't reach the server and no last-known user to show: wait and
  // retry here. Sending her to the sign-in splash is what made a deploy look
  // like a sign-out.
  if (!isAuthenticated && connectionProblem) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
          minHeight: '100vh',
          px: 2,
          textAlign: 'center',
          bgcolor: 'background.default'
        }}
      >
        <CircularProgress size={32} />
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>{CANT_REACH}</Typography>
        {retry && (
          <Button variant="contained" onClick={retry} sx={{ minHeight: 48, borderRadius: 999, fontWeight: 800 }}>
            Try now
          </Button>
        )}
      </Box>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render children if authenticated
  return (
    <>
      {connectionProblem && <ConnectionLine onRetry={retry} />}
      {children}
    </>
  );
};

export default ProtectedRoute;
