import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { loginRedirect } from '../utils/authClient.js';

const Register = () => {
  const location = useLocation();

  useEffect(() => {
    const returnTo = location.state?.from?.pathname
      ? `${window.location.origin}${location.state.from.pathname}`
      : window.location.href;
    loginRedirect(returnTo, 'register');
  }, [location]);

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
      <CircularProgress size={40} />
      <Typography>Redirecting to baseGeek…</Typography>
    </Box>
  );
};

export default Register;